import assert from "node:assert/strict";
import test from "node:test";
import { createHandler } from "../netlify/functions/v1.mjs";
import {
  createD1Compatibility,
  createSupabaseBucket,
  postgresStatement,
} from "../netlify/functions/supabase-runtime.mjs";

function mockDatabase() {
  const calls = [];
  const sql = async (strings, ...values) => {
    const query = strings.join("?").replace(/\s+/g, " ").trim();
    calls.push({ query, values });
    if (query.includes("FROM public.trades")) return [{ id: "trade-1", name: "Horlogerie" }];
    if (query.includes("SELECT email FROM public.users")) return [{ email: "user@example.test" }];
    if (query.includes("UPDATE public.users")) return [];
    if (query.includes("FROM public.users u")) {
      return [{
        id: "user-1",
        email: "user@example.test",
        display_name: "Utilisateur Test",
        eureka_email: "utilisateur.test@eureka.test",
        status: "active",
        global_role: null,
      }];
    }
    if (query.includes("FROM public.trade_memberships") || query.includes("FROM trade_memberships")) {
      return [{
        id: "membership-1",
        trade_id: "trade-1",
        role: "freelance",
        status: "active",
        project_class: "D",
        credits: 0,
        reserved_credits: 0,
        rating: 0,
      }];
    }
    if (query.includes("FROM public.membership_requests")) return [];
    if (query.includes("FROM public.admin_invitations")) return [];
    throw new Error(`Unexpected SQL in test: ${query}`);
  };
  sql.unsafe = async (statement, values = []) => {
    calls.push({ query: statement, values });
    if (statement.includes("FROM users WHERE supabase_auth_id")) {
      return [{
        id: "user-1",
        auth_subject: "supabase:auth-user-1",
        email: "user@example.test",
        display_name: "Utilisateur Test",
        status: "active",
      }];
    }
    if (statement.includes("FROM trade_memberships")) {
      return [{
        id: "membership-1",
        trade_id: "trade-1",
        role: "freelance",
        status: "active",
        project_class: "D",
        credits: 0,
        reserved_credits: 0,
        rating: 0,
      }];
    }
    if (statement.includes("FROM global_roles")) return [];
    if (statement.includes("FROM users WHERE id=")) {
      return [{ eureka_email: "utilisateur.test@eureka.test" }];
    }
    if (statement.includes("FROM trades WHERE status='active'")) {
      return [{ id: "trade-1", name: "Horlogerie", status: "active", created_at: "2025-01-01" }];
    }
    return [];
  };
  sql.end = async () => {};
  return { sql, calls };
}

function event(path, { method = "GET", body, headers = {}, query = {} } = {}) {
  const host = "https://example.test";
  return {
    httpMethod: method,
    path: "/.netlify/functions/v1",
    rawUrl: `${host}/.netlify/functions/v1`,
    queryStringParameters: { route: path.replace(/^\//, ""), ...query },
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  };
}

const savedEnvironment = {
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_DB_URL: process.env.SUPABASE_DB_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
};

test.before(() => {
  process.env.SUPABASE_URL = "https://project.supabase.co";
  process.env.SUPABASE_DB_URL = "postgresql://unused";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "server-test-key";
});

test.after(() => {
  for (const [name, value] of Object.entries(savedEnvironment)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

test("Netlify endpoint returns public trades from Supabase", async () => {
  const database = mockDatabase();
  const handler = createHandler({ createSql: () => database.sql, fetchImpl: fetch });
  const result = await handler(event("/public/trades"));

  assert.equal(result.statusCode, 200);
  assert.deepEqual(JSON.parse(result.body), {
    trades: [{ id: "trade-1", name: "Horlogerie" }],
  });
});

test("login resolves Eurêka identifiers and issues secure HttpOnly cookies", async () => {
  const database = mockDatabase();
  const requests = [];
  const handler = createHandler({
    createSql: () => database.sql,
    fetchImpl: async (url, init) => {
      requests.push({ url: String(url), init });
      return Response.json({
        access_token: "access-token",
        refresh_token: "refresh-token",
        expires_in: 3600,
      });
    },
  });
  const result = await handler(event("/auth/login", {
    method: "POST",
    headers: { origin: "https://example.test" },
    body: { email: "utilisateur.test@eureka.test", password: "SecretPass123" },
  }));

  assert.equal(result.statusCode, 200);
  assert.deepEqual(JSON.parse(requests[0].init.body), {
    email: "user@example.test",
    password: "SecretPass123",
  });
  assert.equal(result.multiValueHeaders["set-cookie"].length, 2);
  assert.ok(result.multiValueHeaders["set-cookie"].every((cookie) =>
    cookie.includes("HttpOnly") && cookie.includes("Secure") && cookie.includes("SameSite=Lax")));
  assert.ok(result.multiValueHeaders["set-cookie"].some((cookie) => cookie.startsWith("eureka_access=") && cookie.includes("Max-Age=3600")));
  assert.ok(result.multiValueHeaders["set-cookie"].some((cookie) => cookie.startsWith("eureka_refresh=") && cookie.includes("Max-Age=2592000")));
});

test("session verifies Supabase identity and maps the Eurêka membership", async () => {
  const database = mockDatabase();
  const handler = createHandler({
    createSql: () => database.sql,
    fetchImpl: async (url) => {
      assert.match(String(url), /\/auth\/v1\/user$/);
      return Response.json({ id: "auth-user-1" });
    },
  });
  const result = await handler(event("/session", {
    headers: { cookie: "eureka_access=access-token" },
  }));
  const body = JSON.parse(result.body);

  assert.equal(result.statusCode, 200);
  assert.equal(body.currentUser.id, "user-1");
  assert.equal(body.currentUser.globalAdmin, false);
  assert.equal(body.memberships[0].role, "freelance");
  assert.deepEqual(body.projects, []);
});

test("mutating requests reject a foreign Origin", async () => {
  const handler = createHandler({ createSql: mockDatabase().sql });
  const result = await handler(event("/auth/logout", {
    method: "POST",
    headers: { origin: "https://attacker.example" },
  }));

  assert.equal(result.statusCode, 403);
  assert.equal(JSON.parse(result.body).code, "csrf_rejected");
});

test("password recovery accepts the Supabase email link and changes the password", async () => {
  const database = mockDatabase();
  const requests = [];
  const handler = createHandler({
    createSql: () => database.sql,
    fetchImpl: async (url, init) => {
      requests.push({ url: String(url), init });
      return Response.json({ id: "auth-user-1" });
    },
  });
  const result = await handler(event("/auth/reset-password", {
    method: "POST",
    body: { code: "recovery-access-token", password: "NewPassword123" },
  }));

  assert.equal(result.statusCode, 200);
  assert.match(requests[0].url, /\/auth\/v1\/user$/);
  assert.equal(requests[0].init.method, "PUT");
  assert.deepEqual(JSON.parse(requests[0].init.body), { password: "NewPassword123" });
});

test("invite activation rejects passwords that do not meet account requirements", async () => {
  const handler = createHandler({
    createSql: () => mockDatabase().sql,
    fetchImpl: async () => {
      throw new Error("Supabase should not be called for an invalid password");
    },
  });
  const result = await handler(event("/auth/reset-password", {
    method: "POST",
    body: { code: "invite-access-token", password: "NoDigitsHere" },
  }));

  assert.equal(result.statusCode, 400);
  assert.equal(JSON.parse(result.body).code, "invalid_reset_request");
});

test("invite activation confirms the email and starts a Eurêka session", async () => {
  const database = mockDatabase();
  const requests = [];
  const handler = createHandler({
    createSql: () => database.sql,
    fetchImpl: async (url, init) => {
      requests.push({ url: String(url), init });
      return Response.json({
        id: "auth-user-1",
        email_confirmed_at: "2026-10-27T20:00:00Z",
      });
    },
  });
  const result = await handler(event("/auth/session", {
    method: "POST",
    body: {
      accessToken: "invite-access-token",
      refreshToken: "invite-refresh-token",
      expiresIn: 3600,
    },
  }));

  assert.equal(result.statusCode, 200);
  assert.match(requests[0].url, /\/auth\/v1\/user$/);
  assert.ok(database.calls.some(({ query }) =>
    query.includes("UPDATE public.users") && query.includes("email_verified = 1")));
  assert.ok(result.multiValueHeaders["set-cookie"].some((cookie) =>
    cookie.startsWith("eureka_access=") && cookie.includes("Max-Age=3600")));
});

test("login reports upstream failures without disguising them as bad credentials", async () => {
  const database = mockDatabase();
  const handler = createHandler({
    createSql: () => database.sql,
    fetchImpl: async () => new Response(null, { status: 503 }),
  });
  const result = await handler(event("/auth/login", {
    method: "POST",
    body: { email: "user@example.test", password: "SecretPass123" },
  }));

  assert.equal(result.statusCode, 502);
  assert.equal(JSON.parse(result.body).code, "auth_service_unavailable");
});

test("registration creates a confirmed-auth workflow request and stores its private document", async () => {
  const statements = [];
  const sql = async (strings, ...values) => {
    const query = strings.join("?").replace(/\s+/g, " ").trim();
    statements.push({ query, values });
    if (query.includes("FROM public.trades")) return [{ id: "trade-1" }];
    return [];
  };
  sql.begin = async (callback) => callback(sql);
  sql.end = async () => {};
  const upstreamRequests = [];
  const handler = createHandler({
    createSql: () => sql,
    fetchImpl: async (url, init) => {
      upstreamRequests.push({ url: String(url), init });
      if (String(url).includes("/auth/v1/signup")) {
        return Response.json({
          user: {
            id: "auth-user-new",
            email: "new@example.test",
            identities: [{ identity_id: "identity-1" }],
          },
        }, { status: 200 });
      }
      return new Response(null, { status: 200 });
    },
  });
  const form = new FormData();
  form.set("name", "Nouveau Membre");
  form.set("email", "new@example.test");
  form.set("password", "StrongPass123");
  form.set("tradeId", "trade-1");
  form.set("role", "freelance");
  form.set("file", new File(["document"], "adhesion.pdf", { type: "application/pdf" }));
  const request = new Request("https://example.test/api/v1/auth/register", {
    method: "POST",
    body: form,
  });
  const result = await handler({
    httpMethod: "POST",
    path: "/.netlify/functions/v1",
    rawUrl: "https://example.test/.netlify/functions/v1",
    queryStringParameters: { route: "auth/register" },
    headers: Object.fromEntries(request.headers),
    body: await request.text(),
  });

  assert.equal(result.statusCode, 201);
  assert.match(JSON.parse(result.body).message, /Vérifiez votre e-mail/);
  assert.ok(upstreamRequests.some(({ url }) => url.includes("/auth/v1/signup")));
  assert.ok(upstreamRequests.some(({ url }) => url.includes("/storage/v1/object/eureka-documents/")));
  assert.ok(statements.some(({ query }) => query.includes("INSERT INTO public.membership_requests")));
  assert.ok(statements.some(({ query }) => query.includes("INSERT INTO public.documents")));
  assert.ok(statements.every(({ values }) => !values.includes("StrongPass123")));
});

test("email confirmation verifies the token before issuing HttpOnly session cookies", async () => {
  const statements = [];
  const sql = async (strings, ...values) => {
    statements.push({ query: strings.join("?"), values });
    return [];
  };
  sql.end = async () => {};
  const handler = createHandler({
    createSql: () => sql,
    fetchImpl: async (url, init) => {
      assert.match(String(url), /\/auth\/v1\/user$/);
      assert.equal(init.headers.authorization, "Bearer signup-access");
      return Response.json({ id: "auth-user-new", email_confirmed_at: "2025-01-01T00:00:00Z" });
    },
  });
  const result = await handler(event("/auth/session", {
    method: "POST",
    body: { accessToken: "signup-access", refreshToken: "signup-refresh", expiresIn: 3600 },
  }));

  assert.equal(result.statusCode, 200);
  assert.equal(result.multiValueHeaders["set-cookie"].length, 2);
  assert.ok(statements.some(({ query, values }) =>
    query.includes("UPDATE public.users") && values.includes("auth-user-new")));
});

test("business endpoints reject requests without a Supabase session", async () => {
  const handler = createHandler({ createSql: () => mockDatabase().sql });
  const result = await handler(event("/projects"));

  assert.equal(result.statusCode, 401);
  assert.equal(JSON.parse(result.body).code, "authentication_required");
});

test("D1 query adapter translates placeholders and SQLite conflict syntax", async () => {
  assert.equal(
    postgresStatement("INSERT OR IGNORE INTO global_roles (user_id, role) VALUES (?, '?')"),
    "INSERT INTO global_roles (user_id, role) VALUES ($1, '?') ON CONFLICT DO NOTHING",
  );
  assert.equal(
    postgresStatement("SELECT * FROM users WHERE email=? COLLATE NOCASE AND id=?"),
    "SELECT * FROM users WHERE email=$1 AND id=$2",
  );
});

test("D1 batch adapter runs statements inside a PostgreSQL transaction", async () => {
  const executed = [];
  const executor = {
    async unsafe(statement, values) {
      executed.push({ statement, values });
      return { count: 1 };
    },
  };
  const sql = Object.assign(async () => [], {
    async begin(callback) {
      executed.push({ transaction: "begin" });
      const result = await callback(executor);
      executed.push({ transaction: "commit" });
      return result;
    },
  });
  const database = createD1Compatibility(sql);
  const results = await database.batch([
    database.prepare("INSERT INTO users (id) VALUES (?)").bind("user-1"),
    database.prepare("UPDATE users SET status=? WHERE id=?").bind("active", "user-1"),
  ]);

  assert.deepEqual(executed.map((entry) => entry.transaction || entry.statement), [
    "begin",
    "INSERT INTO users (id) VALUES ($1)",
    "UPDATE users SET status=$1 WHERE id=$2",
    "commit",
  ]);
  assert.deepEqual(results.map((entry) => entry.meta.changes), [1, 1]);
});

test("Supabase private storage adapter uses the bucket REST API", async () => {
  const requests = [];
  const bucket = createSupabaseBucket({
    baseUrl: "https://project.supabase.co",
    serviceKey: "server-key",
    fetchImpl: async (url, init = {}) => {
      requests.push({ url: String(url), init });
      return new Response(null, { status: 200 });
    },
  });
  await bucket.put("trades/trade-1/file-1", new Uint8Array([1]), {
    httpMetadata: { contentType: "application/pdf" },
    customMetadata: { originalName: "proof.pdf" },
  });
  await bucket.delete("trades/trade-1/file-1");

  assert.match(requests[0].url, /\/storage\/v1\/object\/eureka-documents\/trades\/trade-1\/file-1$/);
  assert.equal(requests[0].init.headers["content-type"], "application/pdf");
  assert.match(requests[0].init.headers["x-metadata"], /^[A-Za-z0-9+/]+=*$/);
  assert.match(requests[1].url, /\/storage\/v1\/object\/eureka-documents$/);
  assert.deepEqual(JSON.parse(requests[1].init.body), { prefixes: ["trades/trade-1/file-1"] });
});
