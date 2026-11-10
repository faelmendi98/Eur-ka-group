import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const databaseDir = path.join(
  rootDir,
  ".wrangler",
  "state",
  "v3",
  "d1",
  "miniflare-D1DatabaseObject",
);
const admins = [
  { name: "Fael Mendi", email: "fael.mendi@eureka.ch" },
  { name: "Isiane Mendi", email: "isiane.mendi@eureka.ch" },
  { name: "Saïd Mendi", email: "said.mendi@eureka-group.ch" },
];
const passwordIterations = 100_000;

function findLocalDatabase() {
  if (!fs.existsSync(databaseDir)) {
    throw new Error("Base D1 locale introuvable. Lance d’abord `npm run dev`.");
  }

  const candidates = fs
    .readdirSync(databaseDir)
    .filter((file) => file.endsWith(".sqlite") && !file.startsWith("metadata"))
    .map((file) => path.join(databaseDir, file))
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs);

  for (const candidate of candidates) {
    const db = new DatabaseSync(candidate);
    const tables = new Set(
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('users', 'profiles', 'global_roles', 'account_credentials')",
        )
        .all()
        .map((row) => row.name),
    );
    const hasEurekaEmail = db
      .prepare("PRAGMA table_info(users)")
      .all()
      .some((column) => column.name === "eureka_email");

    if (tables.size === 4 && hasEurekaEmail) return { db, path: candidate };
    db.close();
  }

  throw new Error("Base D1 locale non initialisée. Lance d’abord `npm run dev`.");
}

function createEurekaEmail(name, db) {
  const base =
    name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ".")
      .replace(/^\.|\.$/g, "")
      .slice(0, 48) || "utilisateur";

  for (let suffix = 0; suffix < 1000; suffix += 1) {
    const candidate = `${base}${suffix ? `.${suffix + 1}` : ""}@eureka.test`;
    const existing = db
      .prepare("SELECT 1 FROM users WHERE eureka_email = ? COLLATE NOCASE")
      .get(candidate);
    if (!existing) return candidate;
  }

  throw new Error(`Impossible de créer un identifiant Eurêka pour ${name}.`);
}

function createPassword() {
  return `${crypto.randomBytes(24).toString("base64url")}A7`;
}

function hashPassword(password, salt) {
  return crypto
    .pbkdf2Sync(password, salt, passwordIterations, 32, "sha256")
    .toString("base64url");
}

function main() {
  const { db, path: databasePath } = findLocalDatabase();
  const newCredentials = [];
  const existingAccounts = [];

  try {
    db.exec("BEGIN IMMEDIATE");

    for (const admin of admins) {
      let user = db
        .prepare(
          "SELECT id, display_name FROM users WHERE email = ? COLLATE NOCASE",
        )
        .get(admin.email);

      if (!user) {
        const userId = `usr_${crypto.randomUUID()}`;
        const eurekaEmail = createEurekaEmail(admin.name, db);
        db.prepare(
          "INSERT INTO users (id, auth_subject, email, eureka_email, display_name, status, email_verified) VALUES (?, ?, ?, ?, ?, 'active', 0)",
        ).run(userId, `eureka:${userId}`, admin.email, eurekaEmail, admin.name);
        db.prepare("INSERT INTO profiles (user_id) VALUES (?)").run(userId);
        user = { id: userId, display_name: admin.name };
      } else {
        db.prepare("INSERT OR IGNORE INTO profiles (user_id) VALUES (?)").run(
          user.id,
        );
      }

      db.prepare(
        "INSERT OR IGNORE INTO global_roles (user_id, role) VALUES (?, 'admin_eureka')",
      ).run(user.id);

      const hasCredentials = db
        .prepare("SELECT 1 FROM account_credentials WHERE user_id = ?")
        .get(user.id);

      if (hasCredentials) {
        existingAccounts.push({ name: user.display_name, email: admin.email });
        continue;
      }

      const password = createPassword();
      const salt = crypto.randomBytes(18).toString("base64url");
      const passwordHash = hashPassword(password, salt);
      db.prepare(
        "INSERT INTO account_credentials (user_id, password_hash, password_salt, password_iterations) VALUES (?, ?, ?, ?)",
      ).run(user.id, passwordHash, salt, passwordIterations);
      newCredentials.push({
        name: user.display_name,
        email: admin.email,
        password,
      });
    }

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  } finally {
    db.close();
  }

  console.log(
    `Admins globaux locaux prêts (base : ${path.basename(databasePath)}).`,
  );

  for (const credential of newCredentials) {
    console.log(
      `Nouveau compte — ${credential.name} — ${credential.email} — mot de passe : ${credential.password}`,
    );
  }

  for (const account of existingAccounts) {
    console.log(
      `Compte déjà configuré, mot de passe inchangé — ${account.name} — ${account.email}`,
    );
  }

  if (newCredentials.length) {
    console.log(
      "Conserve les nouveaux mots de passe en lieu sûr ; ils ne seront pas réaffichés.",
    );
  }
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
