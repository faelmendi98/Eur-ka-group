import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const d1Dir = path.join(rootDir, '.wrangler', 'state', 'v3', 'd1', 'miniflare-D1DatabaseObject');

const dbFiles = fs.existsSync(d1Dir)
  ? fs.readdirSync(d1Dir).filter((entry) => entry.endsWith('.sqlite') && !entry.startsWith('metadata'))
  : [];

const dbPath = dbFiles[0] ? path.join(d1Dir, dbFiles[0]) : null;

if (!dbPath) {
  console.log('No local D1 SQLite database found yet. The app will create it on first run.');
  process.exit(0);
}

const migrationFiles = ['drizzle/0000_eureka_v1.sql', 'drizzle/0001_eureka_accounts.sql', 'drizzle/0002_eureka_identifiers.sql'];
const db = new DatabaseSync(dbPath);

for (const relativePath of migrationFiles) {
  const absolutePath = path.join(rootDir, relativePath);
  const sql = fs.readFileSync(absolutePath, 'utf8');
  const normalized = sql
    .replace(/CREATE TABLE\s+/gi, 'CREATE TABLE IF NOT EXISTS ')
    .replace(/CREATE UNIQUE INDEX\s+/gi, 'CREATE UNIQUE INDEX IF NOT EXISTS ')
    .replace(/CREATE INDEX\s+/gi, 'CREATE INDEX IF NOT EXISTS ')
    .replace(/CREATE TRIGGER\s+/gi, 'CREATE TRIGGER IF NOT EXISTS ');

  db.exec(normalized);
}

const tableNames = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
console.log(`Local D1 schema ready (${tableNames.length} tables found).`);

db.close();
