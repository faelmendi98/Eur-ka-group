/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { handleV1Api } from "./v1-api";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  BUCKET: R2Bucket;
  OWNER_BOOTSTRAP_EMAIL?: string;
  OWNER_BOOTSTRAP_TOKEN?: string;
  EUREKA_TEST_MODE?: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

const shareCategories: Record<string, string> = {
  "Documents de projets": "documents-projets",
  "Normes & standards": "normes-standards",
};
const shareExtensions = new Set(["doc", "docx", "xls", "xlsx", "pdf", "one", "onepkg"]);
const projectExtensions = new Set(["doc", "docx", "xls", "xlsx", "pdf", "one", "onepkg", "step", "stp", "ipt", "iam", "dwg", "dxf", "zip"]);

function safeStorageSegment(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

async function handleShareDocuments(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  if (request.method === "GET" && key) {
    if (!key.startsWith("share/")) return new Response("Fichier invalide", { status: 400 });
    const object = await env.BUCKET.get(key);
    if (!object) return new Response("Document introuvable", { status: 404 });
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);
    headers.set("content-disposition", `inline; filename*=UTF-8''${encodeURIComponent(object.customMetadata?.originalName || "document")}`);
    return new Response(object.body, { headers });
  }
  if (request.method === "GET") {
    const category = url.searchParams.get("category") || "";
    const slug = shareCategories[category];
    if (!slug) return Response.json({ error: "Catégorie invalide" }, { status: 400 });
    const listed = await env.BUCKET.list({ prefix: `share/${slug}/`, include: ["customMetadata", "httpMetadata"] });
    return Response.json({ documents: listed.objects.map((object) => ({ title: object.customMetadata?.documentTitle || object.customMetadata?.originalName || "Document", name: object.customMetadata?.originalName || "document", format: object.customMetadata?.format || "FICHIER", size: object.size, uploadedAt: object.uploaded.toISOString(), url: `/api/share-documents?key=${encodeURIComponent(object.key)}` })) });
  }
  if (request.method === "POST") {
    const form = await request.formData();
    const file = form.get("file");
    const category = String(form.get("category") || "");
    const documentTitle = String(form.get("documentTitle") || "").trim();
    const slug = shareCategories[category];
    if (!(file instanceof File) || !slug || !documentTitle) return Response.json({ error: "Fichier, catégorie ou document invalide" }, { status: 400 });
    if (file.size > 20 * 1024 * 1024) return Response.json({ error: "Le fichier dépasse 20 Mo" }, { status: 413 });
    const originalName = file.name.replace(/[\\/\0]/g, "_").slice(0, 180);
    const extension = (originalName.split(".").pop() || "").toLowerCase();
    if (!shareExtensions.has(extension)) return Response.json({ error: "Format non autorisé" }, { status: 415 });
    const documentSlug = safeStorageSegment(documentTitle);
    const prefix = `share/${slug}/${documentSlug}/`;
    const previous = await env.BUCKET.list({ prefix });
    if (previous.objects.length) await env.BUCKET.delete(previous.objects.map((object) => object.key));
    const objectKey = `${prefix}${Date.now()}-${crypto.randomUUID()}`;
    await env.BUCKET.put(objectKey, await file.arrayBuffer(), { httpMetadata: { contentType: file.type || "application/octet-stream" }, customMetadata: { originalName, documentTitle, format: extension.toUpperCase(), category } });
    return Response.json({ document: { title: documentTitle, name: originalName, format: extension.toUpperCase(), size: file.size, uploadedAt: new Date().toISOString(), url: `/api/share-documents?key=${encodeURIComponent(objectKey)}` } });
  }
  return new Response("Méthode non autorisée", { status: 405 });
}

async function handleProjectDocuments(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const objectKey = url.searchParams.get("key");

  if (request.method === "GET" && objectKey) {
    if (!objectKey.startsWith("projects/")) return new Response("Fichier invalide", { status: 400 });
    const object = await env.BUCKET.get(objectKey);
    if (!object) return new Response("Document introuvable", { status: 404 });
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);
    headers.set("content-disposition", `inline; filename*=UTF-8''${encodeURIComponent(object.customMetadata?.originalName || "document")}`);
    return new Response(object.body, { headers });
  }

  if (request.method === "GET") {
    const project = url.searchParams.get("project") || "";
    const tab = url.searchParams.get("tab") || "";
    const projectSlug = safeStorageSegment(project);
    const tabSlug = safeStorageSegment(tab);
    if (!projectSlug || !tabSlug) return Response.json({ error: "Projet ou rubrique invalide" }, { status: 400 });
    const listed = await env.BUCKET.list({ prefix: `projects/${projectSlug}/${tabSlug}/`, include: ["customMetadata", "httpMetadata"] });
    const documents = listed.objects
      .sort((a, b) => b.uploaded.getTime() - a.uploaded.getTime())
      .map((object) => ({
        name: object.customMetadata?.originalName || "document",
        format: object.customMetadata?.format || "FICHIER",
        uploadedBy: object.customMetadata?.uploadedBy || "Utilisateur",
        uploadedAt: object.uploaded.toISOString(),
        url: `/api/project-documents?key=${encodeURIComponent(object.key)}`,
      }));
    return Response.json({ documents });
  }

  if (request.method === "POST") {
    const form = await request.formData();
    const file = form.get("file");
    const project = String(form.get("project") || "");
    const tab = String(form.get("tab") || "");
    const uploadedBy = String(form.get("role") || "Utilisateur");
    const projectSlug = safeStorageSegment(project);
    const tabSlug = safeStorageSegment(tab);
    if (!(file instanceof File) || !projectSlug || !tabSlug) return Response.json({ error: "Fichier, projet ou rubrique invalide" }, { status: 400 });
    if (file.size > 20 * 1024 * 1024) return Response.json({ error: "Le fichier dépasse 20 Mo" }, { status: 413 });
    const originalName = file.name.replace(/[\\/\0]/g, "_").slice(0, 180);
    const extension = (originalName.split(".").pop() || "").toLowerCase();
    if (!projectExtensions.has(extension)) return Response.json({ error: "Ce format de fichier n’est pas autorisé" }, { status: 415 });
    const key = `projects/${projectSlug}/${tabSlug}/${Date.now()}-${crypto.randomUUID()}`;
    await env.BUCKET.put(key, await file.arrayBuffer(), {
      httpMetadata: { contentType: file.type || "application/octet-stream" },
      customMetadata: { originalName, format: extension.toUpperCase(), project, tab, uploadedBy },
    });
    return Response.json({ document: { name: originalName, format: extension.toUpperCase(), uploadedBy, uploadedAt: new Date().toISOString(), url: `/api/project-documents?key=${encodeURIComponent(key)}` } });
  }

  return new Response("Méthode non autorisée", { status: 405 });
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    if (url.pathname.startsWith("/api/v1/")) {
      return handleV1Api(request, env);
    }

    if (url.pathname === "/api/share-documents" || url.pathname === "/api/project-documents") {
      return Response.json({ error: "Cette ancienne route non sécurisée a été désactivée." }, { status: 410 });
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
