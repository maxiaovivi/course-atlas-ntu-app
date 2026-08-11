const CATALOG_KEY = "library/catalog-v1.json";
const SCHEDULE_KEY = "app/schedule-v1.json";
const ALLOWED_COURSES = new Set(["EE6221", "EE6406", "EE6407", "EE6497"]);
const ALLOWED_SHELVES = new Set(["Lectures", "Assignments", "Study aids", "Quiz", "Exams"]);

function parseRange(value, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value || "");
  if (!match) return null;
  if (!match[1] && match[2]) {
    const suffix = Math.min(Number(match[2]), size);
    return Number.isFinite(suffix) && suffix > 0 ? { start: size - suffix, end: size - 1 } : null;
  }
  const start = Number(match[1]);
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

function requestEmail(request) {
  return (request.headers.get("oai-authenticated-user-email") || "").trim().toLowerCase();
}

function isOwner(request, env) {
  return Boolean(env?.UPLOAD_OWNER_EMAIL && requestEmail(request) === env.UPLOAD_OWNER_EMAIL.trim().toLowerCase());
}

function requireBucket(env) {
  return env?.FILES && typeof env.FILES.get === "function" ? env.FILES : null;
}

function isSchedule(value) {
  if (!value || typeof value !== "object" || value.version !== 1 || value.timezone !== "Asia/Singapore") return false;
  if (typeof value.academicYear !== "string" || value.academicYear.length > 32) return false;
  if (!Number.isInteger(value.semester) || value.semester < 1 || value.semester > 3) return false;
  if (typeof value.source !== "string" || !value.source || value.source.length > 240) return false;
  if (!Array.isArray(value.courses) || value.courses.length > 32 || !Array.isArray(value.exceptions) || value.exceptions.length > 128) return false;
  const time = /^([01]\d|2[0-3]):[0-5]\d$/;
  const date = /^20\d{2}-[01]\d-[0-3]\d$/;
  const text = (item, key, max = 240) => typeof item[key] === "string" && item[key].length > 0 && item[key].length <= max;
  const nullableText = (item, key, max = 500) => item[key] === null || (typeof item[key] === "string" && item[key].length <= max);
  if (!value.courses.every((course) => course && typeof course === "object"
    && /^[A-Z]{2,4}\d{4}[A-Z]?$/.test(course.code)
    && text(course, "name") && text(course, "zh")
    && Number.isInteger(course.weekday) && course.weekday >= 0 && course.weekday <= 6
    && text(course, "dayLabel", 8) && time.test(course.start) && time.test(course.end)
    && nullableText(course, "section", 80) && text(course, "category", 80)
    && text(course, "location") && ["confirmed", "pending"].includes(course.locationStatus)
    && text(course, "locationSource") && nullableText(course, "note"))) return false;
  const courseCodes = new Set(value.courses.map((course) => course.code));
  return value.exceptions.every((exception) => exception && typeof exception === "object"
    && /^[a-z0-9-]{8,120}$/.test(exception.id)
    && courseCodes.has(exception.courseCode) && date.test(exception.date)
    && time.test(exception.start) && time.test(exception.end)
    && text(exception, "label", 120) && text(exception, "location") && text(exception, "note", 500)
    && (exception.replacesDate === undefined || date.test(exception.replacesDate)));
}

async function readSchedule(bucket) {
  const object = await bucket.get(SCHEDULE_KEY);
  if (!object) return null;
  try {
    const parsed = JSON.parse(await object.text());
    return isSchedule(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function updateSchedule(request, env) {
  const bucket = requireBucket(env);
  if (!bucket) return json({ error: "Schedule storage unavailable" }, 503);
  if (!env?.UPLOAD_TOKEN || !safeEqual(request.headers.get("x-upload-token"), env.UPLOAD_TOKEN)) return json({ error: "Unauthorized" }, 401);
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") return json({ error: "Only application/json is accepted" }, 415);
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 128 * 1024) return json({ error: "Schedule payload is too large" }, 413);
  let parsed;
  try {
    const text = await request.text();
    if (!text || text.length > 128 * 1024) return json({ error: "Schedule payload is empty or too large" }, 413);
    parsed = JSON.parse(text);
  } catch {
    return json({ error: "Schedule JSON is invalid" }, 400);
  }
  if (!isSchedule(parsed)) return json({ error: "Schedule schema is invalid" }, 400);
  const schedule = { ...parsed, updatedAt: new Date().toISOString() };
  await bucket.put(SCHEDULE_KEY, JSON.stringify(schedule), {
    httpMetadata: { contentType: "application/json", cacheControl: "public, max-age=60" },
    customMetadata: { purpose: "course-atlas-schedule", version: String(schedule.version) },
  });
  return json({ ok: true, updatedAt: schedule.updatedAt, courses: schedule.courses.length, exceptions: schedule.exceptions.length });
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

function materialVisibility(item) {
  return item.visibility === "public" ? "public" : "private";
}

function publicMaterial(item, owner) {
  const { key: _key, source, ...material } = item;
  const visibility = materialVisibility(item);
  return {
    ...material,
    visibility,
    readable: visibility === "public" || owner,
    source: owner ? source : undefined,
  };
}

function json(data, status = 200, extraHeaders = {}) {
  return Response.json(data, { status, headers: { "Cache-Control": "private, no-store", ...extraHeaders } });
}

function publicJson(data) {
  return Response.json(data, {
    headers: {
      "Cache-Control": "public, max-age=60, stale-while-revalidate=600",
      "Access-Control-Allow-Origin": "*",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function bytesToHex(bytes) {
  return [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function bytesToBase64Url(bytes) {
  let binary = "";
  for (const value of new Uint8Array(bytes)) binary += String.fromCharCode(value);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function ticketSignature(id, expires, secret) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return bytesToBase64Url(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${expires}`)));
}

async function createTicket(id, secret) {
  const expires = Math.floor(Date.now() / 1000) + 10 * 60;
  return `${expires}.${await ticketSignature(id, expires, secret)}`;
}

async function hasValidTicket(request, id, secret) {
  if (!secret) return false;
  const cookie = request.headers.get("cookie") || "";
  const token = cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith("ca_pdf_confirm="))?.slice(15);
  if (!token) return false;
  const [expiresValue, signature] = token.split(".");
  const expires = Number(expiresValue);
  if (!Number.isFinite(expires) || expires < Math.floor(Date.now() / 1000) || !signature) return false;
  return safeEqual(signature, await ticketSignature(id, expires, secret));
}

async function getMaterial(bucket, id) {
  const catalog = await readCatalog(bucket);
  return { catalog, material: catalog.materials.find((item) => item.id === id) };
}

async function confirmMaterial(request, env, id) {
  const bucket = requireBucket(env);
  if (!bucket) return json({ error: "File storage unavailable" }, 503);
  const { material } = await getMaterial(bucket, id);
  if (!material) return json({ error: "Material not found" }, 404);
  if (materialVisibility(material) !== "public" && !isOwner(request, env)) {
    return json({ error: "This course file is not cleared for public redistribution", signInRequired: true }, 403);
  }
  const ticket = await createTicket(id, env.UPLOAD_TOKEN);
  const path = `/api/materials/${id}`;
  return json({ ok: true }, 200, { "Set-Cookie": `ca_pdf_confirm=${ticket}; Max-Age=600; Path=${path}; HttpOnly; Secure; SameSite=Strict` });
}

async function serveMaterial(request, env, id) {
  const bucket = requireBucket(env);
  if (!bucket) return new Response("File storage unavailable", { status: 503 });
  const { material } = await getMaterial(bucket, id);
  if (!material) return new Response("Material not found", { status: 404 });
  if (materialVisibility(material) !== "public" && !isOwner(request, env)) return new Response("Restricted course material", { status: 403 });
  if (!await hasValidTicket(request, id, env.UPLOAD_TOKEN)) return new Response("Confirm before loading this PDF", { status: 428 });

  const metadata = await bucket.head(material.key);
  if (!metadata) return new Response("Stored PDF not found", { status: 404 });
  const range = parseRange(request.headers.get("Range"), metadata.size);
  const object = await bucket.get(material.key, range ? { range: { offset: range.start, length: range.end - range.start + 1 } } : undefined);
  if (!object) return new Response("Stored PDF not found", { status: 404 });

  const length = range ? range.end - range.start + 1 : metadata.size;
  const download = new URL(request.url).searchParams.get("download") === "1";
  const asciiName = `${material.course}-${material.id.slice(-8)}.pdf`;
  const encodedTitle = encodeURIComponent(material.title).replace(/'/g, "%27");
  const headers = new Headers({
    "Content-Type": "application/pdf",
    "Content-Length": String(length),
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
    "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${asciiName}"; filename*=UTF-8''${encodedTitle}`,
    "X-Course-Atlas-Storage": "r2",
    "X-Content-Type-Options": "nosniff",
  });
  if (metadata.httpEtag) headers.set("ETag", metadata.httpEtag);
  if (range) headers.set("Content-Range", `bytes ${range.start}-${range.end}/${metadata.size}`);
  return new Response(request.method === "HEAD" ? null : object.body, { status: range ? 206 : 200, headers });
}

async function storeMaterial(bucket, details, bytes) {
  const key = `library/materials/${details.course}/${details.id}.pdf`;
  await bucket.put(key, bytes, {
    httpMetadata: { contentType: "application/pdf", cacheControl: "private, max-age=3600" },
    customMetadata: { course: details.course, shelf: details.shelf, sha256: details.sha256, visibility: details.visibility },
  });
  const catalog = await readCatalog(bucket);
  const updatedAt = new Date().toISOString();
  const item = { ...details, size: bytes.byteLength, key, updatedAt };
  const index = catalog.materials.findIndex((existing) => existing.id === details.id);
  if (index === -1) catalog.materials.push(item);
  else catalog.materials[index] = item;
  catalog.materials.sort((a, b) => a.course.localeCompare(b.course) || a.shelf.localeCompare(b.shelf) || a.title.localeCompare(b.title));
  catalog.updatedAt = updatedAt;
  await bucket.put(CATALOG_KEY, JSON.stringify(catalog), {
    httpMetadata: { contentType: "application/json", cacheControl: "private, no-store" },
    customMetadata: { purpose: "course-atlas-catalog" },
  });
  return { item, total: catalog.materials.length };
}

async function parsePdfUpload(request, url) {
  const course = url.searchParams.get("course") || "";
  const shelf = url.searchParams.get("shelf") || "";
  const title = url.searchParams.get("title") || "";
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (!ALLOWED_COURSES.has(course) || !ALLOWED_SHELVES.has(shelf)) return { error: json({ error: "Invalid course or shelf" }, 400) };
  if (!title.toLowerCase().endsWith(".pdf") || title.length > 240) return { error: json({ error: "Invalid PDF title" }, 400) };
  if (!contentLength || contentLength > 75 * 1024 * 1024) return { error: json({ error: "PDF must be between 1 byte and 75 MB" }, 413) };
  const bytes = await request.arrayBuffer();
  const header = new Uint8Array(bytes.slice(0, 5));
  if (bytes.byteLength !== contentLength || !header.every((value, index) => value === [37, 80, 68, 70, 45][index])) return { error: json({ error: "Body is not a valid PDF" }, 400) };
  const sha256 = bytesToHex(await crypto.subtle.digest("SHA-256", bytes));
  return { course, shelf, title, bytes, sha256 };
}

async function uploadFromBrowser(request, env, url) {
  const bucket = requireBucket(env);
  if (!bucket) return json({ error: "File storage unavailable" }, 503);
  if (!isOwner(request, env)) return json({ error: "Owner sign-in is required for uploads", signInRequired: true }, 401);
  if (request.headers.get("content-type")?.split(";")[0] !== "application/pdf") return json({ error: "Only application/pdf is accepted" }, 415);
  const parsed = await parsePdfUpload(request, url);
  if (parsed.error) return parsed.error;
  const visibility = url.searchParams.get("visibility") === "public" ? "public" : "private";
  if (visibility === "public" && url.searchParams.get("rightsConfirmed") !== "1") return json({ error: "Sharing rights must be confirmed" }, 400);
  const id = `${parsed.course.toLowerCase()}-${parsed.shelf.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${parsed.sha256.slice(0, 16)}`;
  const { item, total } = await storeMaterial(bucket, {
    id,
    course: parsed.course,
    shelf: parsed.shelf,
    title: parsed.title,
    source: "Uploaded through Course Atlas",
    sha256: parsed.sha256,
    visibility,
  }, parsed.bytes);
  return json({ ok: true, material: publicMaterial(item, true), total });
}

async function uploadFromSync(request, env, url) {
  const bucket = requireBucket(env);
  if (!bucket) return json({ error: "File storage unavailable" }, 503);
  if (!env?.UPLOAD_TOKEN || !safeEqual(request.headers.get("x-upload-token"), env.UPLOAD_TOKEN)) return json({ error: "Unauthorized" }, 401);
  if (request.headers.get("content-type")?.split(";")[0] !== "application/pdf") return json({ error: "Only application/pdf is accepted" }, 415);
  const parsed = await parsePdfUpload(request, url);
  if (parsed.error) return parsed.error;
  const source = url.searchParams.get("source") || "";
  const requestedSha = url.searchParams.get("sha256") || "";
  if (parsed.sha256 !== requestedSha || /\.private|email-imports|student-solutions|external-github|\/sources\//i.test(source)) return json({ error: "Checksum mismatch or excluded source" }, 400);
  const id = url.searchParams.get("id") || "";
  if (!/^[a-z0-9-]{16,96}$/.test(id)) return json({ error: "Invalid material id" }, 400);
  const { item, total } = await storeMaterial(bucket, {
    id,
    course: parsed.course,
    shelf: parsed.shelf,
    title: parsed.title,
    source,
    sha256: parsed.sha256,
    visibility: "private",
  }, parsed.bytes);
  return json({ ok: true, material: publicMaterial(item, true), total });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const owner = isOwner(request, env);

    if (url.pathname === "/api/session" && request.method === "GET") {
      return json({ signedIn: Boolean(requestEmail(request)), owner, name: request.headers.get("oai-authenticated-user-full-name") || null });
    }
    if (url.pathname === "/api/library" && request.method === "GET") {
      const bucket = requireBucket(env);
      if (!bucket) return json({ materials: [], updatedAt: null, storageAvailable: false }, 503);
      const catalog = await readCatalog(bucket);
      return json({ materials: catalog.materials.map((item) => publicMaterial(item, owner)), updatedAt: catalog.updatedAt, storageAvailable: true });
    }
    if (url.pathname === "/api/schedule" && request.method === "GET") {
      const bucket = requireBucket(env);
      if (!bucket) return json({ error: "Schedule storage unavailable" }, 503);
      const schedule = await readSchedule(bucket);
      return schedule ? publicJson(schedule) : json({ error: "Schedule has not been initialized" }, 503);
    }
    if (url.pathname === "/api/upload" && request.method === "POST") return uploadFromBrowser(request, env, url);
    if (url.pathname === "/api/admin/materials" && request.method === "POST") return uploadFromSync(request, env, url);
    if (url.pathname === "/api/admin/schedule" && request.method === "PUT") return updateSchedule(request, env);

    const confirmMatch = /^\/api\/materials\/([a-z0-9-]{16,96})\/confirm$/.exec(url.pathname);
    if (confirmMatch && request.method === "POST") return confirmMaterial(request, env, confirmMatch[1]);
    const materialMatch = /^\/api\/materials\/([a-z0-9-]{16,96})$/.exec(url.pathname);
    if (materialMatch && (request.method === "GET" || request.method === "HEAD")) return serveMaterial(request, env, materialMatch[1]);

    if (!env?.ASSETS || typeof env.ASSETS.fetch !== "function") return new Response("Static asset binding unavailable", { status: 503 });
    if (url.pathname === "/") url.pathname = "/index.html";
    let response = await env.ASSETS.fetch(new Request(url, request));
    if (response.status === 404 && request.method === "GET" && !url.pathname.startsWith("/_next/") && !url.pathname.startsWith("/api/")) {
      url.pathname = "/index.html";
      response = await env.ASSETS.fetch(new Request(url, request));
    }
    return response;
  },
};
