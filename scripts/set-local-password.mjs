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
const email = process.argv[2]?.trim();
const passwordIterations = 100_000;

function readSecret(prompt) {
  return new Promise((resolve, reject) => {
    const input = process.stdin;
    if (!input.isTTY || typeof input.setRawMode !== "function") {
      reject(new Error("Run this command directly in a terminal."));
      return;
    }

    process.stdout.write(prompt);
    input.setEncoding("utf8");
    input.setRawMode(true);
    input.resume();
    let value = "";

    const finish = (error, result) => {
      input.off("data", onData);
      input.setRawMode(false);
      input.pause();
      process.stdout.write("\n");
      if (error) reject(error);
      else resolve(result);
    };

    const onData = (chunk) => {
      for (const character of chunk) {
        if (character === "\u0003") {
          finish(new Error("Password change cancelled."));
          return;
        }
        if (character === "\r" || character === "\n") {
          finish(null, value);
          return;
        }
        if (character === "\u007f" || character === "\b") {
          value = value.slice(0, -1);
        } else {
          value += character;
        }
      }
    };

    input.on("data", onData);
  });
}

async function main() {
  if (!email) {
    throw new Error(
      "Usage: npm run set:local-password -- user@example.com",
    );
  }
  if (!fs.existsSync(databaseDir)) {
    throw new Error("Local D1 database not found. Start `npm run dev` first.");
  }

  const files = fs
    .readdirSync(databaseDir)
    .filter((file) => file.endsWith(".sqlite") && !file.startsWith("metadata"));
  const matches = [];

  for (const file of files) {
    const databasePath = path.join(databaseDir, file);
    const db = new DatabaseSync(databasePath, { readOnly: true });
    try {
      const account = db
        .prepare("SELECT id FROM users WHERE email=? COLLATE NOCASE")
        .get(email);
      if (account) matches.push({ databasePath, userId: account.id });
    } finally {
      db.close();
    }
  }

  if (matches.length !== 1) {
    throw new Error(
      matches.length === 0
        ? `No local account found for ${email}.`
        : `Multiple local accounts found for ${email}; refusing to choose a database.`,
    );
  }

  const password = await readSecret("New local password: ");
  const confirmation = await readSecret("Confirm new local password: ");
  if (password !== confirmation) {
    throw new Error("Passwords do not match.");
  }
  if (password.length < 10 || !/\d/.test(password)) {
    throw new Error("Password must be at least 10 characters and contain a digit.");
  }

  const { databasePath, userId } = matches[0];
  const db = new DatabaseSync(databasePath);
  try {
    const credential = db
      .prepare("SELECT 1 FROM account_credentials WHERE user_id=?")
      .get(userId);
    if (!credential) {
      throw new Error(`No local password credential found for ${email}.`);
    }

    const salt = crypto.randomBytes(18).toString("base64url");
    const hash = crypto
      .pbkdf2Sync(password, salt, passwordIterations, 32, "sha256")
      .toString("base64url");

    db.prepare(
      "UPDATE account_credentials SET password_hash=?,password_salt=?,password_iterations=?,password_updated_at=? WHERE user_id=?",
    ).run(hash, salt, passwordIterations, new Date().toISOString(), userId);
    console.log(`Updated local password for ${email}.`);
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});