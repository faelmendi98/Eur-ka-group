import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationFiles = [
  "drizzle/0000_eureka_v1.sql",
  "drizzle/0001_eureka_accounts.sql",
  "drizzle/0002_eureka_identifiers.sql",
];
const outputFile = path.join(root, "supabase/migrations/0001_initial_schema.sql");

function extractTriggers(sql) {
  const triggers = [];
  const triggerPattern =
    /CREATE TRIGGER\s+(\w+)\s+(BEFORE\s+(?:INSERT|DELETE|UPDATE)\s+ON\s+\w+)\s+WHEN\s+([\s\S]*?)\s+BEGIN\s+SELECT RAISE\(ABORT,\s*'([^']+)'\);\s*END\s*;/gi;
  const withoutTriggers = sql.replace(triggerPattern, (_, name, event, condition, message) => {
    triggers.push({ name, event, condition: condition.trim(), message });
    return "";
  });
  const remaining = withoutTriggers.match(/CREATE TRIGGER\b/gi);
  if (remaining) {
    throw new Error("A SQLite trigger could not be converted safely.");
  }
  return { triggers, sql: withoutTriggers };
}

function splitStatements(sql) {
  const statements = [];
  let buffer = "";
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index];
    const next = sql[index + 1];

    if (inLineComment) {
      if (char === "\n") inLineComment = false;
      buffer += char;
      continue;
    }
    if (inBlockComment) {
      buffer += char;
      if (char === "*" && next === "/") {
        buffer += next;
        index += 1;
        inBlockComment = false;
      }
      continue;
    }
    if (inSingleQuote) {
      buffer += char;
      if (char === "'" && next === "'") {
        buffer += next;
        index += 1;
      } else if (char === "'") {
        inSingleQuote = false;
      }
      continue;
    }
    if (inDoubleQuote) {
      buffer += char;
      if (char === '"' && next === '"') {
        buffer += next;
        index += 1;
      } else if (char === '"') {
        inDoubleQuote = false;
      }
      continue;
    }
    if (char === "-" && next === "-") {
      inLineComment = true;
      buffer += char;
      continue;
    }
    if (char === "/" && next === "*") {
      inBlockComment = true;
      buffer += char;
      continue;
    }
    if (char === "'") inSingleQuote = true;
    if (char === '"') inDoubleQuote = true;
    if (char === ";") {
      if (buffer.trim()) statements.push(buffer.trim());
      buffer = "";
      continue;
    }
    buffer += char;
  }
  if (buffer.trim()) statements.push(buffer.trim());
  return statements;
}

function toPostgres() {
  const statements = [];
  const triggers = [];

  for (const file of migrationFiles) {
    const source = fs.readFileSync(path.join(root, file), "utf8");
    const extracted = extractTriggers(source);
    triggers.push(...extracted.triggers);
    for (const statement of splitStatements(extracted.sql)) {
      if (/^PRAGMA\b/i.test(statement)) continue;
      if (/^CREATE TABLE\s+(?:account_credentials|auth_sessions|password_reset_tokens|auth_attempts)\b/i.test(statement)) continue;
      if (/^CREATE INDEX\s+idx_auth_sessions_/i.test(statement)) continue;
      if (/^CREATE INDEX\s+idx_password_resets_/i.test(statement)) continue;
      if (/^CREATE INDEX\s+idx_auth_attempts_/i.test(statement)) continue;

      let converted = statement
        .replace(/^CREATE TABLE\s+/i, "CREATE TABLE IF NOT EXISTS ")
        .replace(/^CREATE UNIQUE INDEX\s+/i, "CREATE UNIQUE INDEX IF NOT EXISTS ")
        .replace(/^CREATE INDEX\s+/i, "CREATE INDEX IF NOT EXISTS ")
        .replace(/^INSERT\s+INTO\s+/i, "INSERT INTO ")
        .replace(/\s+COLLATE\s+NOCASE/gi, "")
        .replace(/email TEXT NOT NULL UNIQUE/gi, "email CITEXT NOT NULL UNIQUE")
        .replace(/email TEXT(?=[\s,\n])/gi, "email CITEXT")
        .replace(/ALTER TABLE\s+(\w+)\s+ADD COLUMN\s+/i, "ALTER TABLE $1 ADD COLUMN IF NOT EXISTS ")
        .replace(/ADD COLUMN IF NOT EXISTS eureka_email TEXT/gi, "ADD COLUMN IF NOT EXISTS eureka_email CITEXT")
        .replace(/INSERT INTO\s+/i, "INSERT INTO ");

      if (/^INSERT INTO\b/i.test(converted)) {
        converted += " ON CONFLICT DO NOTHING";
      }
      statements.push(`${converted};`);
    }
  }

  for (const trigger of triggers) {
    const functionName = `${trigger.name}_fn`;
    const returnRow = /\bDELETE\b/i.test(trigger.event) ? "OLD" : "NEW";
    statements.push(
      `CREATE OR REPLACE FUNCTION ${functionName}() RETURNS trigger LANGUAGE plpgsql AS $trigger$\nBEGIN\n  IF (${trigger.condition}) THEN\n    RAISE EXCEPTION USING MESSAGE = '${trigger.message}';\n  END IF;\n  RETURN ${returnRow};\nEND;\n$trigger$;`,
      `DROP TRIGGER IF EXISTS ${trigger.name} ON ${trigger.event.match(/\bON\s+(\w+)/i)?.[1]};`,
      `CREATE TRIGGER ${trigger.name} ${trigger.event} FOR EACH ROW EXECUTE FUNCTION ${functionName}();`,
    );
  }

  const tables = statements
    .map((statement) => statement.match(/^CREATE TABLE IF NOT EXISTS\s+(\w+)/i)?.[1])
    .filter(Boolean);
  const securityStatements = [
    "ALTER TABLE public.users ADD COLUMN IF NOT EXISTS supabase_auth_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL;",
    "ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;",
    "REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;",
    ...tables.map((table) => `ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`),
    "INSERT INTO storage.buckets (id, name, public, file_size_limit) VALUES ('eureka-documents', 'eureka-documents', false, 20971520) ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit;",
  ];

  return [
    "-- Generated from the checked-in D1 migrations by scripts/generate-supabase-schema.mjs.",
    "-- Supabase Auth credentials and legacy sessions are deliberately not migrated.",
    "CREATE EXTENSION IF NOT EXISTS citext;",
    ...statements,
    ...securityStatements,
  ].join("\n\n") + "\n";
}

const { triggers, sql: sourceSql } = extractTriggers(
  migrationFiles.map((file) => fs.readFileSync(path.join(root, file), "utf8")).join("\n"),
);
if (triggers.length === 0 || !sourceSql.includes("CREATE TABLE")) {
  throw new Error("The source migrations appear incomplete.");
}

const output = toPostgres();
fs.mkdirSync(path.dirname(outputFile), { recursive: true });
fs.writeFileSync(outputFile, output, "utf8");
console.log(`Generated ${path.relative(root, outputFile)} (${triggers.length} database triggers).`);
