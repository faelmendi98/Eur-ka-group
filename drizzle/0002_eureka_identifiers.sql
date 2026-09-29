ALTER TABLE users ADD COLUMN eureka_email TEXT;

CREATE UNIQUE INDEX uq_users_eureka_email
ON users(eureka_email COLLATE NOCASE)
WHERE eureka_email IS NOT NULL;
