import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = new URL("..", import.meta.url);
const schemaPath = new URL("../supabase/migrations/0001_initial_schema.sql", import.meta.url);

test("le schéma Supabase est reproductible et conserve les protections métier", () => {
  const result = spawnSync(process.execPath, ["scripts/generate-supabase-schema.mjs"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);

  const sql = readFileSync(schemaPath, "utf8");
  assert.match(sql, /CREATE EXTENSION IF NOT EXISTS citext/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS supabase_auth_id uuid UNIQUE REFERENCES auth\.users/);
  assert.equal((sql.match(/CREATE TABLE IF NOT EXISTS /g) || []).length, 33);
  assert.equal((sql.match(/CREATE TRIGGER /g) || []).length, 15);
  assert.equal((sql.match(/ENABLE ROW LEVEL SECURITY/g) || []).length, 33);
  assert.match(sql, /INSERT INTO storage\.buckets[\s\S]*'eureka-documents'[\s\S]*false/);
  assert.doesNotMatch(sql, /CREATE TABLE IF NOT EXISTS (account_credentials|auth_sessions|password_reset_tokens|auth_attempts)\b/);
  assert.doesNotMatch(sql, /\b(PRAGMA|COLLATE NOCASE|INSERT OR IGNORE)\b/i);
});
