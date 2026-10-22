import { handleV1Api } from "../../worker/v1-api.ts";

export function postgresStatement(statement) {
  let output = "";
  let parameter = 0;
  let quote = null;
  for (let index = 0; index < statement.length; index += 1) {
    const character = statement[index];
    if (quote) {
      output += character;
      if (character === quote) {
        if (statement[index + 1] === quote) output += statement[++index];
        else quote = null;
      }
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      output += character;
    } else if (character === "?") {
      output += `$${++parameter}`;
    } else {
      output += character;
    }
  }

  const ignoreConflict = /^\s*INSERT\s+OR\s+IGNORE\s+INTO\b/i.test(output);
  output = output
    .replace(/^\s*INSERT\s+OR\s+IGNORE\s+INTO\b/i, "INSERT INTO")
    .replace(/\s+COLLATE\s+NOCASE\b/gi, "");
  if (ignoreConflict && !/\bON\s+CONFLICT\b/i.test(output)) {
    output = output.replace(/;\s*$/, "") + " ON CONFLICT DO NOTHING";
  }
  return output;
}

function createStatement(sql, statement, values = []) {
  return {
    statement,
    values,
    bind(...boundValues) {
      return createStatement(sql, statement, boundValues);
    },
    async first(type) {
      const rows = await sql.unsafe(postgresStatement(statement), values);
      const row = rows[0] ?? null;
      return type && row ? row : row;
    },
    async all(type) {
      const rows = await sql.unsafe(postgresStatement(statement), values);
      return { results: type ? rows : rows };
    },
    async run() {
      const result = await sql.unsafe(postgresStatement(statement), values);
      return { meta: { changes: result.count } };
    },
  };
}

export function createD1Compatibility(sql) {
  return {
    prepare(statement) {
      return createStatement(sql, statement);
    },
    async batch(statements) {
      return sql.begin(async (transaction) => {
        const results = [];
        for (const statement of statements) {
          const result = await transaction.unsafe(
            postgresStatement(statement.statement),
            statement.values,
          );
          results.push({ meta: { changes: result.count } });
        }
        return results;
      });
    },
  };
}

function storagePath(key) {
  return key.split("/").map(encodeURIComponent).join("/");
}

export function createSupabaseBucket({ baseUrl, serviceKey, fetchImpl = fetch }) {
  const objectUrl = (key) => new URL(`/storage/v1/object/eureka-documents/${storagePath(key)}`, baseUrl);
  const headers = (contentType) => ({
    apikey: serviceKey,
    authorization: `Bearer ${serviceKey}`,
    ...(contentType ? { "content-type": contentType } : {}),
  });
  return {
    async put(key, body, options = {}) {
      const response = await fetchImpl(objectUrl(key), {
        method: "POST",
        headers: {
          ...headers(options.httpMetadata?.contentType || "application/octet-stream"),
          "x-upsert": "false",
          ...(options.customMetadata
            ? { "x-metadata": Buffer.from(JSON.stringify(options.customMetadata)).toString("base64") }
            : {}),
        },
        body,
      });
      if (!response.ok) throw new Error(`Supabase Storage upload failed (${response.status}).`);
    },
    async get(key) {
      const response = await fetchImpl(objectUrl(key), { headers: headers() });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`Supabase Storage download failed (${response.status}).`);
      return { body: response.body };
    },
    async delete(keys) {
      const response = await fetchImpl(new URL("/storage/v1/object/eureka-documents", baseUrl), {
        method: "DELETE",
        headers: { ...headers("application/json") },
        body: JSON.stringify({ prefixes: Array.isArray(keys) ? keys : [keys] }),
      });
      if (!response.ok) throw new Error(`Supabase Storage delete failed (${response.status}).`);
    },
  };
}

export async function handleSupabaseV1(request, { sql, authUserId, baseUrl, serviceKey, fetchImpl = fetch }) {
  const env = {
    DB: createD1Compatibility(sql),
    BUCKET: createSupabaseBucket({ baseUrl, serviceKey, fetchImpl }),
    AUTH_USER_ID: authUserId,
  };
  return handleV1Api(request, env);
}
