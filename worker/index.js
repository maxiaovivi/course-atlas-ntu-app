const CATALOG_KEY = "library/catalog-v1.json";
const ALLOWED_COURSES = new Set(["EE6221", "EE6406", "EE6407", "EE6497"]);
const ALLOWED_SHELVES = new Set(["Lectures", "Assignments", "Study aids", "Quiz", "Exams"]);

function parseRange(value, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value || "");
  if (!match) return null;
  const start = match[1] ? Number(match[1]) : 0;
  const end = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) return null;
  return { start, end: Math.min(end, size - 1) };
}

function safeEqual(left, right) {
  const a = new TextEncoder().encode(left || "");
  const b = new TextEncoder().encode(right || "");
  let mismatch = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) mismatch |= (a[index] || 0) ^ (b[index] || 0);
  return mismatch === 0;
}

function requireBucket(env) {
  return env?.FILES && typeof env.FILES.get === "function" ? env.FILES : null;
}

async function readCatalog(bucket) {
  const object = await bucket.get(CATALOG_KEY);
  if (!object) return { version: 1, updatedAt: null, materials: [] };
  try {
    const parsed = JSON.parse(await object.text());
    return Array.isArray(parsed.materials) ? parsed : { version: 1, updatedAt: null, materials: [] };
  } catch {
    return { version: 1, updatedAt: null, materials: [] };
  }
}

function publicMaterial(item) {
  const { key: _key, ...material } = item;
  return material;
}

function json(data, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
}

async function serveMaterial(request, env, id) {
  const bucket = requireBucket(env);
  if (!bucket) return new Response("File storage unavailable", { status: 503 });
  const catalog = await readCatalog(bucket);
  const material = catalog.materials.find((item) => item.id === id);
  if (!material) return new Response("Material not found", { status: 404 });

  const metadata = await bucket.head(material.key);
  if (!metadata) return new Response("Stored PDF not found", { status: 404 });
  const range = parseRange(request.headers.get("Range"), metadata.size);
  const object = await bucket.get(material.key, range ? { range: { offset: range.start, length: range.end - range.start + 1 } } : undefined);
  if (!object) return new Response("Stored PDF not found", { status: 404 });

  const length = range ? range.end - range.start + 1 : metadata.size;
  const asciiName = `${material.course}-${material.id.slice(-8)}.pdf`;
  const headers = new Headers({
    "Content-Type": "application/pdf",
    "Content-Length": String(length),
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
    "Content-Disposition": `inline; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(material.title)}`,
    "X-Course-Atlas-Storage": "r2",
    "X-Content-Type-Options": "nosniff",
  });
  if (metadata.httpEtag) headers.set("ETag", metadata.httpEtag);
  if (range) headers.set("Content-Range", `bytes ${range.start}-${range.end}/${metadata.size}`);
  return new Response(request.method === "HEAD" ? null : object.body, { status: range ? 206 : 200, headers });
}

async function uploadMaterial(request, env, url) {
  const bucket = requireBucket(env);
  if (!bucket) return json({ error: "File storage unavailable" }, 503);
  if (!env?.UPLOAD_TOKEN || !safeEqual(request.headers.get("x-upload-token"), env.UPLOAD_TOKEN)) {
    return json({ error: "Unauthorized" }, 401);
  }
  if (request.headers.get("content-type")?.split(";")[0] !== "application/pdf") {
    return json({ error: "Only application/pdf is accepted" }, 415);
  }

  const course = url.searchParams.get("course") || "";
  const shelf = url.searchParams.get("shelf") || "";
  const id = url.searchParams.get("id") || "";
  const title = url.searchParams.get("title") || "";
  const source = url.searchParams.get("source") || "";
  const sha256 = url.searchParams.get("sha256") || "";
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (!ALLOWED_COURSES.has(course) || !ALLOWED_SHELVES.has(shelf) || !/^[a-z0-9-]{16,96}$/.test(id)) {
    return json({ error: "Invalid course, shelf, or id" }, 400);
  }
  if (!title.toLowerCase().endsWith(".pdf") || title.length > 240 || !/^[a-f0-9]{64}$/.test(sha256)) {
    return json({ error: "Invalid title or checksum" }, 400);
  }
  if (!contentLength || contentLength > 75 * 1024 * 1024) return json({ error: "Invalid file size" }, 413);
  if (/\.private|email-imports|student-solutions|external-github|\/sources\//i.test(source)) {
    return json({ error: "Source path is excluded by vault policy" }, 400);
  }

  const bytes = await request.arrayBuffer();
  if (bytes.byteLength !== contentLength || !new Uint8Array(bytes.slice(0, 5)).every((value, index) => value === [37, 80, 68, 70, 45][index])) {
    return json({ error: "Body is not a valid PDF upload" }, 400);
  }
  const key = `library/materials/${course}/${id}.pdf`;
  await bucket.put(key, bytes, {
    httpMetadata: { contentType: "application/pdf", cacheControl: "private, max-age=3600" },
    customMetadata: { course, shelf, sha256 },
  });

  const catalog = await readCatalog(bucket);
  const updatedAt = new Date().toISOString();
  const item = { id, course, shelf, title, size: bytes.byteLength, source, sha256, key, updatedAt };
  const materialIndex = catalog.materials.findIndex((existing) => existing.id === id);
  if (materialIndex === -1) catalog.materials.push(item);
  else catalog.materials[materialIndex] = item;
  catalog.materials.sort((a, b) => a.course.localeCompare(b.course) || a.shelf.localeCompare(b.shelf) || a.title.localeCompare(b.title));
  catalog.updatedAt = updatedAt;
  await bucket.put(CATALOG_KEY, JSON.stringify(catalog), {
    httpMetadata: { contentType: "application/json", cacheControl: "private, no-store" },
    customMetadata: { purpose: "course-atlas-catalog" },
  });
  return json({ ok: true, material: publicMaterial(item), total: catalog.materials.length });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/library" && request.method === "GET") {
      const bucket = requireBucket(env);
      if (!bucket) return json({ materials: [], updatedAt: null, storageAvailable: false }, 503);
      const catalog = await readCatalog(bucket);
      return json({ materials: catalog.materials.map(publicMaterial), updatedAt: catalog.updatedAt, storageAvailable: true });
    }

    if (url.pathname === "/api/storage/status" && request.method === "GET") {
      const bucket = requireBucket(env);
      const catalog = bucket ? await readCatalog(bucket) : { materials: [] };
      return json({ available: Boolean(bucket), binding: bucket ? "FILES" : null, materials: catalog.materials.length });
    }

    if (url.pathname === "/api/admin/materials" && request.method === "POST") {
      return uploadMaterial(request, env, url);
    }

    const materialMatch = /^\/api\/materials\/([a-z0-9-]{16,96})$/.exec(url.pathname);
    if (materialMatch && (request.method === "GET" || request.method === "HEAD")) {
      return serveMaterial(request, env, materialMatch[1]);
    }

    if (!env?.ASSETS || typeof env.ASSETS.fetch !== "function") {
      return new Response("Static asset binding unavailable", { status: 503 });
    }

    if (url.pathname === "/") url.pathname = "/index.html";
    let response = await env.ASSETS.fetch(new Request(url, request));
    if (response.status === 404 && request.method === "GET" && !url.pathname.startsWith("/_next/") && !url.pathname.startsWith("/api/")) {
      url.pathname = "/index.html";
      response = await env.ASSETS.fetch(new Request(url, request));
    }
    return response;
  },
};
