import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath, pathToFileURL } from "node:url";
import postgres from "postgres";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const wranglerPath = path.join(root, "node_modules", "wrangler", "bin", "wrangler.js");
const schemaPath = path.join(root, "supabase", "migrations", "0001_initial_schema.sql");
const wranglerConfigPath = path.join(root, "wrangler.jsonc");
const excludedTables = new Set([
  "account_credentials",
  "auth_attempts",
  "auth_sessions",
  "password_reset_tokens",
]);
const maxFreeDatabaseBytes = 500 * 1024 * 1024;

function loadLocalEnvironment() {
  const envFile = path.join(root, ".env.local");
  if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

  const required = ["SUPABASE_DB_URL", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length) {
    throw new Error(`Configure ${missing.join(", ")} in the ignored local .env.local file first.`);
  }
  new URL(process.env.SUPABASE_URL);
}

function readSourceConfig() {
  const config = JSON.parse(fs.readFileSync(wranglerConfigPath, "utf8"));
  const database = config.d1_databases?.find((item) => item.binding === "DB");
  if (!database?.database_id || !database.database_name) {
    throw new Error("The Wrangler config is missing the source D1 database binding.");
  }
  return database;
}

function sourceDatabaseSize(databaseId) {
  const result = spawnSync(process.execPath, [wranglerPath, "d1", "list", "--json"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (result.error || result.status !== 0) {
    throw new Error("Could not read the source D1 database size from Wrangler.");
  }
  const database = JSON.parse(result.stdout).find((item) => item.uuid === databaseId);
  if (!database || !Number.isFinite(Number(database.file_size))) {
    throw new Error("The source D1 database size is unavailable.");
  }
  return Number(database.file_size);
}

function exportSourceDatabase(databaseName, destination) {
  const result = spawnSync(
    process.execPath,
    [
      wranglerPath,
      "d1",
      "export",
      databaseName,
      "--remote",
      "--skip-confirmation",
      "--output",
      destination,
    ],
    { cwd: root, encoding: "utf8", stdio: "ignore" },
  );
  if (result.error || result.status !== 0) {
    throw new Error("Could not read the remote D1 export. Check the local Wrangler login and D1 read access.");
  }
}

function readApplicationTables() {
  const schema = fs.readFileSync(schemaPath, "utf8");
  return [...schema.matchAll(/CREATE TABLE IF NOT EXISTS\s+([a-z_][a-z0-9_]*)/gi)]
    .map((match) => match[1])
    .filter((table) => !excludedTables.has(table));
}

function countRows(db, table) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(table)) throw new Error("Unexpected table name in migration schema.");
  return Number(db.prepare(`SELECT COUNT(*) AS count FROM "${table}"`).get().count);
}

function readRows(db, table) {
  const columns = db.prepare(`PRAGMA table_info("${table}")`).all().map((column) => column.name);
  const rows = db.prepare(`SELECT * FROM "${table}"`).all();
  return { columns, rows };
}

async function authRequest(baseUrl, serviceKey, endpoint, init = {}) {
  const response = await fetch(new URL(`/auth/v1/admin/${endpoint}`, baseUrl), {
    ...init,
    headers: {
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
      "content-type": "application/json",
      ...init.headers,
    },
  });
  if (!response.ok) {
    throw new Error(`Supabase Auth admin request failed (${response.status}). Check the service-role key and Auth service.`);
  }
  return response.json();
}

async function existingAuthUsers(baseUrl, serviceKey) {
  const users = [];
  for (let page = 1; ; page += 1) {
    const result = await authRequest(
      baseUrl,
      serviceKey,
      `users?page=${page}&per_page=1000`,
    );
    users.push(...(result.users || []));
    if (!result.users || result.users.length < 1000) return users;
  }
}

async function provisionAuthUsers(baseUrl, serviceKey, sourceDb) {
  const knownUsers = await existingAuthUsers(baseUrl, serviceKey);
  const byLegacyId = new Map(
    knownUsers
      .filter((user) => user.user_metadata?.eureka_user_id)
      .map((user) => [String(user.user_metadata.eureka_user_id), user]),
  );
  const byEmail = new Map(
    knownUsers
      .filter((user) => user.email)
      .map((user) => [String(user.email).toLowerCase(), user]),
  );
  const sourceUsers = sourceDb.prepare("SELECT id,email FROM users ORDER BY id").all();
  const mapping = new Map();

  for (const sourceUser of sourceUsers) {
    let authUser = byLegacyId.get(sourceUser.id);
    const emailUser = byEmail.get(sourceUser.email.toLowerCase());
    if (authUser && emailUser && emailUser.id !== authUser.id) {
      throw new Error("A source user email conflicts with a different Supabase Auth account.");
    }
    if (!authUser && emailUser) {
      throw new Error("A source user email already belongs to a Supabase Auth account; resolve the duplicate before importing.");
    }
    if (!authUser) {
      authUser = await authRequest(baseUrl, serviceKey, "users", {
        method: "POST",
        body: JSON.stringify({
          email: sourceUser.email,
          password: `${randomBytes(32).toString("base64url")}a7`,
          email_confirm: true,
          user_metadata: {
            eureka_user_id: sourceUser.id,
            must_reset_password: true,
          },
        }),
      });
      byLegacyId.set(sourceUser.id, authUser);
      byEmail.set(sourceUser.email.toLowerCase(), authUser);
    }
    mapping.set(sourceUser.id, authUser.id);
  }
  return mapping;
}

async function importRows(targetDb, sourceDb, table, authUserIds) {
  const { columns, rows } = readRows(sourceDb, table);
  if (!rows.length) return 0;

  const targetColumns = [...columns];
  if (table === "users" && !targetColumns.includes("supabase_auth_id")) {
    targetColumns.push("supabase_auth_id");
  }
  const quotedColumns = targetColumns.map((column) => `"${column}"`).join(", ");
  const placeholders = targetColumns.map((_, index) => `$${index + 1}`).join(", ");
  const query = `INSERT INTO public."${table}" (${quotedColumns}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;

  await targetDb.begin(async (transaction) => {
    for (const row of rows) {
      const values = columns.map((column) => row[column]);
      if (table === "users") values.push(authUserIds.get(row.id));
      await transaction.unsafe(query, values);
    }
  });
  return rows.length;
}

async function main() {
  loadLocalEnvironment();
  const apply = process.argv.includes("--apply");
  const source = readSourceConfig();
  const tables = readApplicationTables();
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "eureka-d1-supabase-"));
  const exportPath = path.join(temporaryDirectory, "source.sql");
  let sourceDb;
  const targetDb = postgres(process.env.SUPABASE_DB_URL, {
    max: 1,
    prepare: false,
    ssl: "require",
  });

  try {
    exportSourceDatabase(source.database_name, exportPath);
    sourceDb = new DatabaseSync(":memory:");
    sourceDb.exec(fs.readFileSync(exportPath, "utf8"));

    const missingTables = tables.filter((table) => !sourceDb
      .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?")
      .get(table));
    if (missingTables.length) {
      throw new Error(`The source D1 database is missing expected tables: ${missingTables.join(", ")}.`);
    }

    const documentCount = countRows(sourceDb, "documents");
    if (documentCount > 0) {
      throw new Error("The source contains document records. Transfer and verify their R2 files before importing database rows.");
    }

    const sourceCounts = new Map(tables.map((table) => [table, countRows(sourceDb, table)]));
    const totalRows = [...sourceCounts.values()].reduce((total, count) => total + count, 0);
    const targetSize = Number((await targetDb`SELECT pg_database_size(current_database()) AS bytes`)[0].bytes);
    const sourceSize = sourceDatabaseSize(source.database_id);
    if (targetSize + sourceSize * 2 > maxFreeDatabaseBytes) {
      throw new Error("The Supabase Free database is too close to its 500 MB limit for this source copy.");
    }

    const targetTables = await targetDb`
      SELECT count(*)::int AS count
      FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename = ANY(${targetDb.array(tables)})
    `;
    if (Number(targetTables[0].count) !== tables.length) {
      throw new Error("The Supabase schema is incomplete. Apply supabase/migrations/0001_initial_schema.sql first.");
    }

    console.log(`Preflight passed: ${totalRows} source rows in ${tables.length} tables; no document records; D1 uses ${sourceSize} bytes and Supabase uses ${targetSize} bytes.`);
    if (!apply) {
      console.log("Dry run only. Re-run with --apply to create reset-required Auth accounts and copy the rows.");
      return;
    }

    const authUserIds = await provisionAuthUsers(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      sourceDb,
    );
    for (const table of tables) {
      await importRows(targetDb, sourceDb, table, authUserIds);
    }

    for (const [table, expectedCount] of sourceCounts) {
      const result = await targetDb`SELECT count(*)::int AS count FROM public.${targetDb(table)}`;
      if (Number(result[0].count) < expectedCount) {
        throw new Error(`Import verification failed for table ${table}.`);
      }
    }
    console.log(`Import complete: ${totalRows} source rows copied. Users must reset passwords before signing in.`);
  } finally {
    sourceDb?.close();
    await targetDb.end();
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "D1 to Supabase migration failed.");
    process.exitCode = 1;
  });
}
