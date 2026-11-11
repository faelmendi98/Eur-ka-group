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

const migrationFiles = ['drizzle/0000_eureka_v1.sql', 'drizzle/0001_eureka_accounts.sql', 'drizzle/0002_eureka_identifiers.sql', 'drizzle/0003_global_projects.sql'];
const db = new DatabaseSync(dbPath);

function splitSqlStatements(sql) {
  const statements = [];
  let buffer = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inLineComment = false;
  let inBlockComment = false;
  let beginDepth = 0;

  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i];
    const next = sql[i + 1];

    if (inLineComment) {
      buffer += char;
      if (char === '\n') inLineComment = false;
      continue;
    }

    if (inBlockComment) {
      buffer += char;
      if (char === '*' && next === '/') {
        buffer += next;
        i += 1;
        inBlockComment = false;
      }
      continue;
    }

    if (inSingleQuote) {
      buffer += char;
      if (char === "'" && next === "'") {
        buffer += next;
        i += 1;
      } else if (char === "'") {
        inSingleQuote = false;
      }
      continue;
    }

    if (inDoubleQuote) {
      buffer += char;
      if (char === '"' && next === '"') {
        buffer += next;
        i += 1;
      } else if (char === '"') {
        inDoubleQuote = false;
      }
      continue;
    }

    if (char === '-' && next === '-') {
      buffer += char;
      inLineComment = true;
      continue;
    }

    if (char === '/' && next === '*') {
      buffer += char;
      inBlockComment = true;
      continue;
    }

    if (char === "'") {
      inSingleQuote = true;
      buffer += char;
      continue;
    }

    if (char === '"') {
      inDoubleQuote = true;
      buffer += char;
      continue;
    }

    if (/[A-Za-z_]/.test(char)) {
      const start = i;
      while (i < sql.length && /[A-Za-z0-9_]/.test(sql[i])) {
        i += 1;
      }
      const word = sql.slice(start, i);
      const upper = word.toUpperCase();
      if (upper === 'BEGIN') {
        beginDepth += 1;
      } else if (upper === 'END' && beginDepth > 0) {
        beginDepth -= 1;
      }
      buffer += word;
      i -= 1;
      continue;
    }

    if (char === ';' && beginDepth === 0) {
      const statement = buffer.trim();
      if (statement) statements.push(statement);
      buffer = '';
      continue;
    }

    buffer += char;
  }

  const tail = buffer.trim();
  if (tail) statements.push(tail);
  return statements;
}

for (const relativePath of migrationFiles) {
  const absolutePath = path.join(rootDir, relativePath);
  const sql = fs.readFileSync(absolutePath, 'utf8');
  const normalized = sql
    .replace(/CREATE TABLE\s+/gi, 'CREATE TABLE IF NOT EXISTS ')
    .replace(/CREATE UNIQUE INDEX\s+/gi, 'CREATE UNIQUE INDEX IF NOT EXISTS ')
    .replace(/CREATE INDEX\s+/gi, 'CREATE INDEX IF NOT EXISTS ')
    .replace(/CREATE TRIGGER\s+/gi, 'CREATE TRIGGER IF NOT EXISTS ')
    .replace(/INSERT INTO\s+/gi, 'INSERT OR IGNORE INTO ');

  for (const statement of splitSqlStatements(normalized)) {
    const trimmed = statement.trim();
    if (!trimmed) continue;

    const alterMatch = trimmed.match(/^ALTER TABLE\s+(\w+)\s+ADD COLUMN\s+(\w+)/i);
    if (alterMatch) {
      const tableName = alterMatch[1];
      const columnName = alterMatch[2];
      const existingColumns = db.prepare(`PRAGMA table_info(${tableName})`).all();
      if (existingColumns.some((column) => column.name === columnName)) continue;
    }

    db.exec(`${trimmed};`);
  }
}

const tableNames = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
console.log(`Local D1 schema ready (${tableNames.length} tables found).`);

db.close();
