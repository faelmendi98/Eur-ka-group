import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const root = process.cwd();
const d1Dir = path.join(root, '.wrangler', 'state', 'v3', 'd1', 'miniflare-D1DatabaseObject');
const files = fs.existsSync(d1Dir)
  ? fs.readdirSync(d1Dir).filter((name) => name.endsWith('.sqlite') && !name.startsWith('metadata'))
  : [];

if (!files.length) {
  throw new Error('Aucune base locale D1 trouvée. Démarre le site au moins une fois pour créer la base locale.');
}

const dbPath = (() => {
  for (const file of files) {
    const candidate = path.join(d1Dir, file);
    try {
      const db = new DatabaseSync(candidate);
      const exists = db.prepare("SELECT COUNT(*) count FROM sqlite_master WHERE type='table' AND name='users'").get();
      db.close();
      if (exists.count > 0) return candidate;
    } catch {
      // ignore candidate if it is not a valid DB file
    }
  }
  return path.join(d1Dir, files[0]);
})();

const db = new DatabaseSync(dbPath);
const email = 'test1234@Eureka.ch';
const password = 'Test12345678';
const tradeId = 'trade-freelance-test';
const userId = 'usr-freelance-test';
const membershipId = 'mem-freelance-test';
const passwordIterations = 100000;

const bytesToBase64Url = (bytes) => {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return Buffer.from(binary, 'binary').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

const randomToken = (size = 18) => bytesToBase64Url(crypto.randomBytes(size));

const passwordHash = async (pass, salt, iterations = passwordIterations) => {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({
    name: 'PBKDF2',
    hash: 'SHA-256',
    salt: new TextEncoder().encode(salt),
    iterations,
  }, key, 256);
  return bytesToBase64Url(new Uint8Array(bits));
};

const ensureTrade = () => {
  db.prepare("INSERT OR IGNORE INTO trades (id, name, status, created_at, updated_at) VALUES (?, ?, 'active', datetime('now'), datetime('now'))").run(tradeId, 'Métier test');
};

const ensureUser = () => {
  db.prepare("INSERT OR REPLACE INTO users (id, auth_subject, email, display_name, status, email_verified, created_at, updated_at, last_login_at, disabled_at) VALUES (?, ?, ?, ?, 'active', 1, datetime('now'), datetime('now'), NULL, NULL)").run(userId, `eureka:${userId}`, email.toLowerCase(), 'Test Freelance');
};

const ensureProfile = () => {
  db.prepare("INSERT OR IGNORE INTO profiles (user_id, locale, created_at, updated_at) VALUES (?, 'fr-CH', datetime('now'), datetime('now'))").run(userId);
};

const ensureMembership = () => {
  db.prepare("INSERT OR REPLACE INTO trade_memberships (id, trade_id, user_id, role, status, project_class, credits, reserved_credits, rating, created_at, updated_at) VALUES (?, ?, ?, 'freelance', 'active', 'D', 0, 0, 0, datetime('now'), datetime('now'))").run(membershipId, tradeId, userId);
};

const ensureCredentials = async () => {
  const salt = randomToken(18);
  const hash = await passwordHash(password, salt);
  db.prepare("INSERT OR REPLACE INTO account_credentials (user_id, password_hash, password_salt, password_iterations, password_updated_at, created_at) VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))").run(userId, hash, salt, passwordIterations);
};

const ensureEurekaEmail = () => {
  const hasColumn = db.prepare("PRAGMA table_info(users)").all().some((col) => col.name === 'eureka_email');
  if (!hasColumn) {
    db.exec("ALTER TABLE users ADD COLUMN eureka_email TEXT; CREATE UNIQUE INDEX IF NOT EXISTS uq_users_eureka_email ON users(eureka_email COLLATE NOCASE) WHERE eureka_email IS NOT NULL;");
  }
  db.prepare("UPDATE users SET eureka_email = ?, updated_at = datetime('now') WHERE id = ?").run('test.freelance@eureka.test', userId);
};

const loginCheck = async () => {
  const response = await fetch('http://localhost:5174/api/v1/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const text = await response.text();
  console.log('HTTP_STATUS', response.status);
  console.log('LOGIN_RESPONSE', text);
  console.log('SET_COOKIE', response.headers.get('set-cookie'));
  return { status: response.status, text, setCookie: response.headers.get('set-cookie') };
};

(async () => {
  ensureTrade();
  ensureUser();
  ensureProfile();
  ensureMembership();
  await ensureCredentials();
  ensureEurekaEmail();
  const row = db.prepare("SELECT u.id, u.email, u.eureka_email, ac.password_hash FROM users u JOIN account_credentials ac ON ac.user_id = u.id WHERE u.id = ?").get(userId);
  const login = await loginCheck();
  const logPath = path.join(root, '.tmp', 'freelance-test-user.json');
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.writeFileSync(logPath, JSON.stringify({ dbPath, user: row, login }, null, 2));
  console.log('CREATED_ACCOUNT', JSON.stringify(row));
  db.close();
})();
