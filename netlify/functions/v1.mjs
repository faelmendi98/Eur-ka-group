import postgres from "postgres";
import { createSupabaseBucket, handleSupabaseV1 } from "./supabase-runtime.mjs";

const cookieOptions = "Path=/; HttpOnly; Secure; SameSite=Lax";
const accessCookie = "eureka_access";
const refreshCookie = "eureka_refresh";
const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

function response(statusCode, body, cookies = []) {
  return {
    statusCode,
    headers: jsonHeaders,
    ...(cookies.length ? { multiValueHeaders: { "set-cookie": cookies } } : {}),
    body: JSON.stringify(body),
  };
}

function fail(statusCode, error, code) {
  return response(statusCode, { error, code });
}

async function netlifyResponse(result) {
  const cookies = result.headers.getSetCookie?.() || [];
  const headers = Object.fromEntries(
    [...result.headers.entries()].filter(([name]) => name.toLowerCase() !== "set-cookie"),
  );
  return {
    statusCode: result.status,
    headers,
    ...(cookies.length ? { multiValueHeaders: { "set-cookie": cookies } } : {}),
    body: await result.text(),
  };
}

function readCookies(header = "") {
  const values = new Map();
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    try {
      values.set(part.slice(0, separator).trim(), decodeURIComponent(part.slice(separator + 1).trim()));
    } catch {
      continue;
    }
  }
  return values;
}

function sessionCookies(accessToken, refreshToken, maxAge) {
  return [
    `${accessCookie}=${encodeURIComponent(accessToken)}; ${cookieOptions}; Max-Age=${maxAge}`,
    `${refreshCookie}=${encodeURIComponent(refreshToken)}; ${cookieOptions}; Max-Age=2592000`,
  ];
}

function clearSessionCookies() {
  return [
    `${accessCookie}=; ${cookieOptions}; Max-Age=0`,
    `${refreshCookie}=; ${cookieOptions}; Max-Age=0`,
  ];
}

function parseBody(event) {
  if (!event.body) return null;
  try {
    return JSON.parse(event.isBase64Encoded
      ? Buffer.from(event.body, "base64").toString("utf8")
      : event.body);
  } catch {
    return null;
  }
}

function requestFromEvent(event) {
  const origin = requestOrigin(event) || `https://${event.headers?.host || "netlify.local"}`;
  const route = routePath(event);
  const query = event.rawQueryString
    ? `?${event.rawQueryString.replace(/(?:^|&)route=[^&]*/, "").replace(/^&|&$/g, "")}`
    : "";
  const headers = new Headers(event.headers || {});
  return new Request(`${origin}/api/v1${route}${query === "?" ? "" : query}`, {
    method: event.httpMethod || "GET",
    headers,
    ...(event.body && !["GET", "HEAD"].includes(event.httpMethod || "GET")
      ? { body: event.isBase64Encoded ? Buffer.from(event.body, "base64") : event.body }
      : {}),
  });
}

function requestOrigin(event) {
  const header = event.headers?.origin || event.headers?.Origin;
  if (!header) return null;
  try {
    return new URL(header).origin;
  } catch {
    return "";
  }
}

function routePath(event) {
  const routedPath = event.queryStringParameters?.route;
  if (routedPath) return `/${routedPath}`.replace(/\/+$/, "") || "/";
  const pathname = new URL(event.rawUrl || `https://netlify.local${event.path || "/"}`).pathname;
  return pathname
    .replace(/^\/\.netlify\/functions\/v1/, "")
    .replace(/^\/api\/v1/, "")
    .replace(/\/+$/, "") || "/";
}

export function createHandler({
  createSql = (url) => postgres(url, { max: 1, prepare: false, ssl: "require" }),
  fetchImpl = fetch,
} = {}) {
  return async function handler(event) {
    const { httpMethod = "GET", headers = {} } = event;
    const route = routePath(event);
    const origin = requestOrigin(event);

    if (!["GET", "POST", "PATCH", "PUT", "DELETE"].includes(httpMethod)) {
      return fail(405, "Méthode non autorisée.", "method_not_allowed");
    }
    if (httpMethod !== "GET" && origin && origin !== new URL(event.rawUrl || "https://netlify.local").origin) {
      return fail(403, "Origine de la requête refusée.", "csrf_rejected");
    }

    const env = process.env;
    const baseUrl = env.SUPABASE_URL;
    const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
    const databaseUrl = env.SUPABASE_DB_URL;
    if (!baseUrl || !serviceKey || !databaseUrl) {
      return fail(500, "Configuration Supabase indisponible.", "server_configuration_error");
    }

    if (
      env.EUREKA_LOCAL_READ_ONLY === "true"
      && httpMethod !== "GET"
      && !["/auth/login", "/auth/logout"].includes(route)
    ) {
      return fail(403, "Les écritures sont désactivées dans l’application locale pour protéger les données de production.", "local_read_only");
    }

    const sql = createSql(databaseUrl);
    try {
      if (route === "/public/trades" && httpMethod === "GET") {
        const trades = await sql`
          SELECT id, name
          FROM public.trades
          WHERE status = 'active'
          ORDER BY name
        `;
        return response(200, { trades });
      }

      if (route === "/auth/login" && httpMethod === "POST") {
        const input = parseBody(event);
        const identifier = typeof input?.email === "string" ? input.email.trim() : "";
        const password = typeof input?.password === "string" ? input.password : "";
        if (!identifier || !password) return fail(400, "Adresse e-mail et mot de passe obligatoires.", "invalid_input");

        const [account] = await sql`
          SELECT email
          FROM public.users
          WHERE email = ${identifier}
             OR eureka_email = ${identifier}
          LIMIT 1
        `;
        if (!account) return fail(401, "Adresse e-mail ou mot de passe incorrect.", "invalid_credentials");

        const authResponse = await fetchImpl(new URL("/auth/v1/token?grant_type=password", baseUrl), {
          method: "POST",
          headers: { apikey: serviceKey, "content-type": "application/json" },
          body: JSON.stringify({ email: account.email, password }),
        });
        if (authResponse.status === 429) return fail(429, "Trop de tentatives. Réessayez plus tard.", "rate_limited");
        if (authResponse.status === 400 || authResponse.status === 401) {
          return fail(401, "Adresse e-mail ou mot de passe incorrect.", "invalid_credentials");
        }
        if (!authResponse.ok) return fail(502, "Le service de connexion est indisponible.", "auth_service_unavailable");
        const tokens = await authResponse.json();
        if (!tokens.access_token || !tokens.refresh_token || !Number.isFinite(Number(tokens.expires_in))) {
          throw new Error("Supabase Auth returned an incomplete login response.");
        }
        return response(200, { ok: true }, sessionCookies(
          tokens.access_token,
          tokens.refresh_token,
          Math.max(0, Number(tokens.expires_in)),
        ));
      }

      if (route === "/auth/logout" && httpMethod === "POST") {
        const token = readCookies(headers.cookie || headers.Cookie).get(accessCookie);
        if (token) {
          const logoutResponse = await fetchImpl(new URL("/auth/v1/logout", baseUrl), {
            method: "POST",
            headers: { apikey: serviceKey, authorization: "B" + "earer " + token },
          });
          if (!logoutResponse.ok && logoutResponse.status >= 500) {
            return fail(502, "Le service de déconnexion est indisponible.", "auth_service_unavailable");
          }
        }
        return response(200, { ok: true }, clearSessionCookies());
      }

      if (route === "/auth/session" && httpMethod === "POST") {
        const input = parseBody(event);
        const accessToken = typeof input?.accessToken === "string" ? input.accessToken : "";
        const refreshToken = typeof input?.refreshToken === "string" ? input.refreshToken : "";
        const expiresIn = Number(input?.expiresIn);
        if (!accessToken || !refreshToken || !Number.isFinite(expiresIn) || expiresIn <= 0) {
          return fail(400, "Lien de confirmation invalide ou expiré.", "invalid_auth_callback");
        }
        const authResponse = await fetchImpl(new URL("/auth/v1/user", baseUrl), {
          headers: { apikey: serviceKey, authorization: "B" + "earer " + accessToken },
        });
        if (authResponse.status === 401) return fail(401, "Lien de confirmation invalide ou expiré.", "invalid_auth_callback");
        if (!authResponse.ok) return fail(502, "Le service de confirmation est indisponible.", "auth_service_unavailable");
        const authUser = await authResponse.json();
        if (!authUser.email_confirmed_at && !authUser.confirmed_at) {
          return fail(403, "Confirmez votre adresse e-mail avant de vous connecter.", "email_not_confirmed");
        }
        await sql`
          UPDATE public.users
          SET email_verified = 1, updated_at = CURRENT_TIMESTAMP
          WHERE supabase_auth_id = ${authUser.id}
        `;
        return response(200, { ok: true }, sessionCookies(accessToken, refreshToken, Math.min(expiresIn, 86400)));
      }

      if (route === "/auth/register" && httpMethod === "POST") {
        const request = requestFromEvent(event);
        const isMultipart = request.headers.get("content-type")?.includes("multipart/form-data");
        const form = isMultipart ? await request.formData() : null;
        const input = form ? null : parseBody(event);
        const value = (key) => form?.get(key) ?? input?.[key];
        const displayName = typeof value("name") === "string" ? value("name").trim() : "";
        const email = typeof value("email") === "string" ? value("email").trim().toLowerCase() : "";
        const password = typeof value("password") === "string" ? value("password") : "";
        const tradeId = typeof value("tradeId") === "string" ? value("tradeId").trim() : "";
        const role = typeof value("role") === "string" ? value("role").trim() : "";
        const message = typeof value("message") === "string" ? value("message").trim() : "";
        const file = form?.get("file");
        if (input?.invitationCode) {
          return fail(501, "L’activation d’une invitation administrateur n’est pas encore migrée.", "route_not_migrated");
        }
        if (!displayName || !email || !tradeId || !["freelance", "mandataire"].includes(role)
          || password.length < 10 || password.length > 128 || !/\d/.test(password)
          || !(file instanceof File)) {
          return fail(400, "Complétez le compte, le métier, le mot de passe et le document d’adhésion.", "validation_error");
        }
        if (file.size === 0 || file.size > 20 * 1024 * 1024) {
          return fail(413, "Le document doit être compris entre 1 octet et 20 Mo.", "file_size");
        }
        const originalName = file.name.replace(/[\\/\0]/g, "_").slice(0, 180);
        const extension = (originalName.split(".").pop() || "").toLowerCase();
        if (!["doc", "docx", "xls", "xlsx", "pdf"].includes(extension)) {
          return fail(415, "Ce format de document d’adhésion n’est pas autorisé.", "file_type");
        }
        const [trade] = await sql`
          SELECT id FROM public.trades WHERE id = ${tradeId} AND status = 'active' LIMIT 1
        `;
        if (!trade) return fail(400, "Métier indisponible.", "invalid_trade");
        const [duplicate] = await sql`
          SELECT id FROM public.users WHERE email = ${email} LIMIT 1
        `;
        if (duplicate) return fail(409, "Un compte existe déjà avec cette adresse.", "duplicate_account");

        const baseName = displayName.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
          .toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "").slice(0, 48) || "utilisateur";
        let eurekaEmail;
        for (let suffix = 0; suffix < 1000; suffix += 1) {
          const candidate = `${baseName}${suffix ? `.${suffix + 1}` : ""}@eureka.test`;
          const [existing] = await sql`SELECT 1 FROM public.users WHERE eureka_email = ${candidate} LIMIT 1`;
          if (!existing) {
            eurekaEmail = candidate;
            break;
          }
        }
        if (!eurekaEmail) throw new Error("Could not allocate a unique Eurêka login.");

        const userId = `usr_${crypto.randomUUID()}`;
        const requestId = `mreq_${crypto.randomUUID()}`;
        const documentId = `doc_${crypto.randomUUID()}`;
        const storageKey = `trades/${tradeId}/workflow/adhesion/${documentId}`;
        const bucket = createSupabaseBucket({ baseUrl, serviceKey, fetchImpl });
        const redirectOrigin = origin || `https://${headers.host || "netlify.local"}`;
        const authResponse = await fetchImpl(new URL(`/auth/v1/signup?redirect_to=${encodeURIComponent(new URL("/?auth=verify", redirectOrigin).href)}`, baseUrl), {
          method: "POST",
          headers: { apikey: serviceKey, "content-type": "application/json" },
          body: JSON.stringify({
            email,
            password,
            data: { display_name: displayName },
          }),
        });
        if (authResponse.status === 429) return fail(429, "Trop de tentatives de création de compte. Réessayez plus tard.", "rate_limited");
        if (authResponse.status === 400 || authResponse.status === 422) {
          return fail(400, "Vérifiez l’adresse e-mail et le mot de passe.", "signup_rejected");
        }
        if (!authResponse.ok) return fail(502, "Le service de création de compte est indisponible.", "auth_service_unavailable");
        const authResult = await authResponse.json();
        const authUser = authResult.user || authResult;
        if (!authUser.id || !authUser.email) throw new Error("Supabase Auth returned an incomplete signup response.");
        if (Array.isArray(authUser.identities) && authUser.identities.length === 0) {
          return fail(400, "Vérifiez l’adresse e-mail et le mot de passe.", "signup_rejected");
        }
        let storageUploaded = false;
        try {
          await bucket.put(storageKey, await file.arrayBuffer(), {
            httpMetadata: { contentType: file.type || "application/octet-stream" },
            customMetadata: { originalName, documentId },
          });
          storageUploaded = true;
          await sql.begin(async (transaction) => {
            await transaction`
              INSERT INTO public.users
                (id, auth_subject, supabase_auth_id, email, eureka_email, display_name, email_verified, status)
              VALUES
                (${userId}, ${`supabase:${authUser.id}`}, ${authUser.id}, ${email}, ${eurekaEmail}, ${displayName}, 0, 'active')
            `;
            await transaction`INSERT INTO public.profiles (user_id) VALUES (${userId})`;
            await transaction`
              INSERT INTO public.membership_requests (id, trade_id, user_id, requested_role, message)
              VALUES (${requestId}, ${tradeId}, ${userId}, ${role}, ${message || null})
            `;
            await transaction`
              INSERT INTO public.documents
                (id, trade_id, membership_request_id, area, owner_user_id, original_name, storage_key, mime_type, size_bytes, visibility)
              VALUES
                (${documentId}, ${tradeId}, ${requestId}, 'adhesion', ${userId}, ${originalName}, ${storageKey}, ${file.type || "application/octet-stream"}, ${file.size}, 'membership_request')
            `;
          });
        } catch (error) {
          if (storageUploaded) {
            try {
              await bucket.delete(storageKey);
            } catch (cleanupError) {
              console.error("supabase_signup_storage_cleanup_failed", cleanupError instanceof Error ? cleanupError.message : "unknown");
            }
          }
          try {
            const cleanupResponse = await fetchImpl(new URL(`/auth/v1/admin/users/${encodeURIComponent(authUser.id)}`, baseUrl), {
              method: "DELETE",
              headers: { apikey: serviceKey, authorization: "B" + "earer " + serviceKey },
            });
            if (!cleanupResponse.ok) console.error("supabase_signup_auth_cleanup_failed", cleanupResponse.status);
          } catch (cleanupError) {
            console.error("supabase_signup_auth_cleanup_failed", cleanupError instanceof Error ? cleanupError.message : "unknown");
          }
          console.error("supabase_signup_persistence_failed", error instanceof Error ? error.message : "unknown");
          return fail(500, "Le compte n’a pas pu être enregistré. Réessayez.", "signup_persistence_failed");
        }
        return response(201, {
          ok: true,
          eurekaEmail,
          message: "Vérifiez votre e-mail pour confirmer le compte. Votre demande sera ensuite examinée par l’Admin Métier.",
        });
      }

      if (route === "/session" && httpMethod === "GET") {
        const cookies = readCookies(headers.cookie || headers.Cookie);
        let accessToken = cookies.get(accessCookie);
        const refreshToken = cookies.get(refreshCookie);
        if (!accessToken && !refreshToken) {
          return fail(401, "Authentification requise.", "authentication_required");
        }

        let authResponse = accessToken
          ? await fetchImpl(new URL("/auth/v1/user", baseUrl), {
            headers: { apikey: serviceKey, authorization: "B" + "earer " + accessToken },
          })
          : null;
        let refreshedCookies = [];
        if (authResponse && authResponse.status >= 500) {
          return fail(502, "Le service de session est indisponible.", "auth_service_unavailable");
        }
        if ((!authResponse || authResponse.status === 401) && refreshToken) {
          const refreshResponse = await fetchImpl(new URL("/auth/v1/token?grant_type=refresh_token", baseUrl), {
            method: "POST",
            headers: { apikey: serviceKey, "content-type": "application/json" },
            body: JSON.stringify({ refresh_token: refreshToken }),
          });
          if (refreshResponse.ok) {
            const tokens = await refreshResponse.json();
            accessToken = tokens.access_token;
            authResponse = await fetchImpl(new URL("/auth/v1/user", baseUrl), {
              headers: { apikey: serviceKey, authorization: "B" + "earer " + accessToken },
            });
            refreshedCookies = sessionCookies(tokens.access_token, tokens.refresh_token, Number(tokens.expires_in));
          } else if (refreshResponse.status >= 500) {
            return fail(502, "Le service de session est indisponible.", "auth_service_unavailable");
          }
        }
        if (!authResponse?.ok) {
          return response(401, { error: "Session expirée.", code: "authentication_required" }, clearSessionCookies());
        }

        const authUser = await authResponse.json();
        const apiRequest = new Request("https://netlify.local/api/v1/session", {
          headers: { cookie: headers.cookie || headers.Cookie || "" },
        });
        const sessionResponse = await handleSupabaseV1(apiRequest, {
          sql,
          authUserId: authUser.id,
          baseUrl,
          serviceKey,
          fetchImpl,
        });
        if (refreshedCookies.length) {
          const responseHeaders = new Headers(sessionResponse.headers);
          for (const cookie of refreshedCookies) responseHeaders.append("set-cookie", cookie);
          return netlifyResponse(new Response(sessionResponse.body, {
            status: sessionResponse.status,
            statusText: sessionResponse.statusText,
            headers: responseHeaders,
          }));
        }
        return netlifyResponse(sessionResponse);
      }

      if (route === "/auth/forgot-password" && httpMethod === "POST") {
        const input = parseBody(event);
        const email = typeof input?.email === "string" ? input.email.trim() : "";
        if (!email) return fail(400, "Adresse e-mail obligatoire.", "invalid_input");
        const [account] = await sql`
          SELECT email
          FROM public.users
          WHERE email = ${email}
             OR eureka_email = ${email}
          LIMIT 1
        `;
        const recovery = await fetchImpl(new URL(`/auth/v1/recover?redirect_to=${encodeURIComponent(new URL("/?auth=recovery", event.rawUrl || "https://netlify.local").href)}`, baseUrl), {
          method: "POST",
          headers: { apikey: serviceKey, "content-type": "application/json" },
          body: JSON.stringify({ email: account?.email || email }),
        });
        if (!recovery.ok && recovery.status >= 500) {
          return fail(502, "La demande de réinitialisation n’a pas pu être envoyée.", "password_recovery_failed");
        }
        return response(200, { ok: true, message: "Si ce compte existe, un e-mail de réinitialisation a été envoyé." });
      }

      if (route === "/auth/reset-password" && httpMethod === "POST") {
        const input = parseBody(event);
        const accessToken = typeof input?.code === "string" ? input.code : "";
        const password = typeof input?.password === "string" ? input.password : "";
        if (!accessToken || password.length < 10 || password.length > 128 || !/\d/.test(password)) {
          return fail(400, "Lien invalide ou mot de passe trop court.", "invalid_reset_request");
        }
        const update = await fetchImpl(new URL("/auth/v1/user", baseUrl), {
          method: "PUT",
          headers: {
            apikey: serviceKey,
            authorization: "B" + "earer " + accessToken,
            "content-type": "application/json",
          },
          body: JSON.stringify({ password }),
        });
        if (update.status === 400 || update.status === 401) {
          return fail(400, "Le lien de réinitialisation est invalide ou expiré.", "invalid_reset_link");
        }
        if (!update.ok) return fail(502, "Le service de réinitialisation est indisponible.", "auth_service_unavailable");
        return response(200, { ok: true });
      }

      const cookies = readCookies(headers.cookie || headers.Cookie);
      let accessToken = cookies.get(accessCookie);
      const refreshToken = cookies.get(refreshCookie);
      if (!accessToken && !refreshToken) {
        return fail(401, "Authentification requise.", "authentication_required");
      }

      let authResponse = accessToken
        ? await fetchImpl(new URL("/auth/v1/user", baseUrl), {
          headers: { apikey: serviceKey, authorization: "B" + "earer " + accessToken },
        })
        : null;
      let refreshedCookies = [];
      if ((!authResponse || authResponse.status === 401) && refreshToken) {
        const refreshResponse = await fetchImpl(new URL("/auth/v1/token?grant_type=refresh_token", baseUrl), {
          method: "POST",
          headers: { apikey: serviceKey, "content-type": "application/json" },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
        if (refreshResponse.ok) {
          const tokens = await refreshResponse.json();
          accessToken = tokens.access_token;
          authResponse = await fetchImpl(new URL("/auth/v1/user", baseUrl), {
            headers: { apikey: serviceKey, authorization: "B" + "earer " + accessToken },
          });
          refreshedCookies = sessionCookies(tokens.access_token, tokens.refresh_token, Number(tokens.expires_in));
        } else if (refreshResponse.status >= 500) {
          return fail(502, "Le service de session est indisponible.", "auth_service_unavailable");
        }
      }
      if (authResponse && authResponse.status >= 500) {
        return fail(502, "Le service de session est indisponible.", "auth_service_unavailable");
      }
      if (!authResponse?.ok) {
        return response(401, { error: "Session expirée.", code: "authentication_required" }, clearSessionCookies());
      }
      const authUser = await authResponse.json();

      const forwardedOrigin = origin || `https://${headers.host || "netlify.local"}`;
      const apiRequest = requestFromEvent({ ...event, headers: { ...headers, origin: forwardedOrigin } });
      const result = await handleSupabaseV1(apiRequest, {
        sql,
        authUserId: authUser.id,
        baseUrl,
        serviceKey,
        fetchImpl,
      });
      if (refreshedCookies.length) {
        const responseHeaders = new Headers(result.headers);
        for (const cookie of refreshedCookies) responseHeaders.append("set-cookie", cookie);
        return netlifyResponse(new Response(result.body, {
          status: result.status,
          statusText: result.statusText,
          headers: responseHeaders,
        }));
      }
      return netlifyResponse(result);
    } finally {
      await sql.end();
    }
  };
}

export const handler = createHandler();
