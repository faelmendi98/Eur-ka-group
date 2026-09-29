CREATE TABLE account_credentials (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_iterations INTEGER NOT NULL DEFAULT 210000 CHECK (password_iterations BETWEEN 100000 AND 1000000),
  password_updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE auth_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_auth_sessions_user ON auth_sessions(user_id,revoked_at,expires_at);
CREATE INDEX idx_auth_sessions_token ON auth_sessions(token_hash);

CREATE TABLE password_reset_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_password_resets_user ON password_reset_tokens(user_id,used_at,expires_at);

CREATE TABLE auth_attempts (
  id TEXT PRIMARY KEY,
  email_hash TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('success','failure','blocked','password_reset')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_auth_attempts_limit ON auth_attempts(email_hash,ip_hash,outcome,created_at);

CREATE TRIGGER prevent_last_global_admin_removal
BEFORE DELETE ON global_roles
WHEN OLD.role='admin_eureka'
 AND (SELECT COUNT(*) FROM global_roles WHERE role='admin_eureka') <= 1
BEGIN SELECT RAISE(ABORT,'last_global_admin'); END;
