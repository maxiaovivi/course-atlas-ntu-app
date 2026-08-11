const CATALOG_KEY = "library/catalog-v1.json";
const SCHEDULE_KEY = "app/schedule-v1.json";
const NTULEARN_SNAPSHOT_KEY = "app/ntulearn-v1.json";
const NTULEARN_SYNC_STATUS_KEY = "app/ntulearn-sync-status-v1.json";
const ALLOWED_COURSES = new Set(["EE6221", "EE6406", "EE6407", "EE6497"]);
const ALLOWED_SHELVES = new Set(["Lectures", "Assignments", "Study aids", "Quiz", "Exams"]);

export const DEFAULT_SCHEDULE = {
  version: 1,
  academicYear: "AY2026-27",
  semester: 1,
  timezone: "Asia/Singapore",
  updatedAt: "2026-08-11T00:00:00+08:00",
  source: "AY2026-27 S1 CCA Student Timetable V2",
  courses: [
    {
      code: "EE6497",
      name: "Pattern Recognition & Deep Learning",
      zh: "模式识别与深度学习",
      weekday: 1,
      dayLabel: "周一",
      start: "19:00",
      end: "22:00",
      section: null,
      category: "General",
      location: "待公布",
      locationStatus: "pending",
      locationSource: "GSCRS / NTULearn",
      note: "学院课表备注时间为 19:00–22:00。",
    },
    {
      code: "EE6407",
      name: "Genetic Algorithms & Machine Learning",
      zh: "遗传算法与机器学习",
      weekday: 2,
      dayLabel: "周二",
      start: "18:30",
      end: "21:30",
      section: "Group A",
      category: "Specialized",
      location: "待公布",
      locationStatus: "pending",
      locationSource: "GSCRS / NTULearn",
      note: "已按晚间 Group A 排列；Group B 为周二 09:30–12:30。",
    },
    {
      code: "EE6221",
      name: "Robotics & Intelligent Sensors",
      zh: "机器人与智能传感",
      weekday: 3,
      dayLabel: "周三",
      start: "18:30",
      end: "21:30",
      section: null,
      category: "Specialized",
      location: "待公布",
      locationStatus: "pending",
      locationSource: "GSCRS / NTULearn",
      note: null,
    },
    {
      code: "EE6406",
      name: "Analytic & Ensemble Machine Learning",
      zh: "分析与集成学习",
      weekday: 4,
      dayLabel: "周四",
      start: "18:30",
      end: "21:30",
      section: null,
      category: "General",
      location: "待公布",
      locationStatus: "pending",
      locationSource: "GSCRS / NTULearn",
      note: null,
    },
  ],
  exceptions: [
    {
      id: "ee6497-2026-08-11-makeup",
      courseCode: "EE6497",
      date: "2026-08-11",
      start: "13:00",
      end: "16:00",
      label: "Week 1 补课",
      location: "Microsoft Teams · 在线",
      note: "替代 8 月 10 日因公共假期取消的首次面授课。",
      replacesDate: "2026-08-10",
    },
  ],
};

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

function isIsoDate(value) {
  return typeof value === "string" && value.length <= 40 && Number.isFinite(Date.parse(value));
}

function isNtuLearnUrl(value) {
  if (typeof value !== "string" || value.length > 1000) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "ntulearn.ntu.edu.sg";
  } catch {
    return false;
  }
}

function isNtuLearnSnapshot(value) {
  if (!value || typeof value !== "object" || value.version !== 1 || !isIsoDate(value.collectedAt)) return false;
  if (!Array.isArray(value.courses) || value.courses.length > 32 || !Array.isArray(value.items) || value.items.length > 1200) return false;
  if (!value.courses.every((course) => course && typeof course === "object"
    && typeof course.id === "string" && course.id.length > 0 && course.id.length <= 160
    && /^[A-Z]{2,4}\d{4}[A-Z]?$/.test(course.code)
    && typeof course.name === "string" && course.name.length > 0 && course.name.length <= 240)) return false;
  const courseCodes = new Set(value.courses.map((course) => course.code));
  return value.items.every((item) => item && typeof item === "object"
    && typeof item.id === "string" && item.id.length > 0 && item.id.length <= 200
    && courseCodes.has(item.courseCode)
    && ["announcement", "material", "assignment"].includes(item.type)
    && typeof item.title === "string" && item.title.length > 0 && item.title.length <= 300
    && isNtuLearnUrl(item.url)
    && (item.publishedAt === null || isIsoDate(item.publishedAt))
    && (item.updatedAt === null || isIsoDate(item.updatedAt))
    && (item.dueAt === null || isIsoDate(item.dueAt)));
}

function defaultNtuLearnStatus() {
  return { state: "idle", requestedAt: null, startedAt: null, finishedAt: null, message: null };
}

async function readNtuLearnStatus(bucket) {
  const object = await bucket.get(NTULEARN_SYNC_STATUS_KEY);
  if (!object) return defaultNtuLearnStatus();
  try {
    const value = JSON.parse(await object.text());
    return value && typeof value.state === "string" ? value : defaultNtuLearnStatus();
  } catch {
    return defaultNtuLearnStatus();
  }
}

async function writeNtuLearnStatus(bucket, status) {
  await bucket.put(NTULEARN_SYNC_STATUS_KEY, JSON.stringify(status), {
    httpMetadata: { contentType: "application/json", cacheControl: "private, no-store" },
    customMetadata: { purpose: "course-atlas-ntulearn-sync-status" },
  });
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
  if (!object) {
    const schedule = { ...DEFAULT_SCHEDULE, updatedAt: new Date().toISOString() };
    await bucket.put(SCHEDULE_KEY, JSON.stringify(schedule), {
      httpMetadata: { contentType: "application/json", cacheControl: "public, max-age=60" },
      customMetadata: { purpose: "course-atlas-schedule", version: String(schedule.version) },
    });
    return schedule;
  }
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

async function readNtuLearnSnapshot(bucket) {
  const object = await bucket.get(NTULEARN_SNAPSHOT_KEY);
  if (!object) return { version: 1, collectedAt: null, courses: [], items: [] };
  try {
    const value = JSON.parse(await object.text());
    return isNtuLearnSnapshot(value) ? value : { version: 1, collectedAt: null, courses: [], items: [] };
  } catch {
    return { version: 1, collectedAt: null, courses: [], items: [] };
  }
}

function publicNtuLearnSummary(snapshot) {
  return {
    version: snapshot.version,
    collectedAt: snapshot.collectedAt,
    courseCount: snapshot.courses.length,
    itemCount: snapshot.items.length,
  };
}

function publicNtuLearnStatus(status) {
  const successCount = typeof status.message === "string"
    ? /^已同步 (\d+) 门课程、(\d+) 条更新$/.exec(status.message)
    : null;
  const messages = {
    idle: null,
    queued: "同步请求已发送",
    running: "正在读取 NTULearn",
    success: successCount ? `已同步 ${successCount[1]} 门课程、${successCount[2]} 条更新` : "同步完成",
    login_required: "需要重新登录 NTULearn",
    error: "同步未完成，请稍后重试",
  };
  return {
    state: status.state,
    requestedAt: status.requestedAt ?? null,
    startedAt: status.startedAt ?? null,
    finishedAt: status.finishedAt ?? null,
    message: Object.prototype.hasOwnProperty.call(messages, status.state) ? messages[status.state] : messages.error,
  };
}

async function updateNtuLearnSnapshot(request, env) {
  const bucket = requireBucket(env);
  if (!bucket) return json({ error: "NTULearn storage unavailable" }, 503);
  if (!env?.NTULEARN_UPLOAD_TOKEN || !safeEqual(request.headers.get("x-upload-token"), env.NTULEARN_UPLOAD_TOKEN)) return json({ error: "Unauthorized" }, 401);
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") return json({ error: "Only application/json is accepted" }, 415);
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 1024 * 1024) return json({ error: "NTULearn payload is too large" }, 413);
  let parsed;
  try {
    const text = await request.text();
    if (!text || text.length > 1024 * 1024) return json({ error: "NTULearn payload is empty or too large" }, 413);
    parsed = JSON.parse(text);
  } catch {
    return json({ error: "NTULearn JSON is invalid" }, 400);
  }
  if (!isNtuLearnSnapshot(parsed)) return json({ error: "NTULearn schema is invalid" }, 400);
  await bucket.put(NTULEARN_SNAPSHOT_KEY, JSON.stringify(parsed), {
    httpMetadata: { contentType: "application/json", cacheControl: "private, no-store" },
    customMetadata: { purpose: "course-atlas-ntulearn-snapshot", version: String(parsed.version) },
  });
  const status = {
    state: "success",
    requestedAt: (await readNtuLearnStatus(bucket)).requestedAt,
    startedAt: null,
    finishedAt: new Date().toISOString(),
    message: `已同步 ${parsed.courses.length} 门课程、${parsed.items.length} 条更新`,
  };
  await writeNtuLearnStatus(bucket, status);
  return json({ ok: true, collectedAt: parsed.collectedAt, courses: parsed.courses.length, items: parsed.items.length });
}

async function updateNtuLearnStatus(request, env) {
  const bucket = requireBucket(env);
  if (!bucket) return json({ error: "NTULearn storage unavailable" }, 503);
  if (!env?.NTULEARN_UPLOAD_TOKEN || !safeEqual(request.headers.get("x-upload-token"), env.NTULEARN_UPLOAD_TOKEN)) return json({ error: "Unauthorized" }, 401);
  let parsed;
  try { parsed = await request.json(); } catch { return json({ error: "Status JSON is invalid" }, 400); }
  if (!parsed || !["idle", "queued", "running", "login_required", "error"].includes(parsed.state)) return json({ error: "Status schema is invalid" }, 400);
  const previous = await readNtuLearnStatus(bucket);
  const status = {
    state: parsed.state,
    requestedAt: previous.requestedAt,
    startedAt: parsed.state === "running" ? new Date().toISOString() : previous.startedAt,
    finishedAt: ["login_required", "error"].includes(parsed.state) ? new Date().toISOString() : null,
    message: typeof parsed.message === "string" ? parsed.message.slice(0, 240) : null,
    loginUrl: parsed.state === "login_required" && isNtuLearnUrl(parsed.loginUrl) ? parsed.loginUrl : undefined,
  };
  await writeNtuLearnStatus(bucket, status);
  return json({ ok: true, status });
}

async function triggerNtuLearnRefresh(env) {
  const response = await fetch(`${env.NTULEARN_COLLECTOR_URL.replace(/\/$/, "")}/refresh`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.NTULEARN_COLLECTOR_TOKEN}`, Accept: "application/json" },
  });
  const value = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`Collector rejected refresh (${response.status})`);
  return value && typeof value === "object" ? value.status : null;
}

async function requestNtuLearnRefresh(env) {
  const bucket = requireBucket(env);
  if (!bucket) return json({ error: "NTULearn storage unavailable" }, 503);
  if (!env?.NTULEARN_COLLECTOR_URL || !env?.NTULEARN_COLLECTOR_TOKEN) return json({ error: "NTULearn collector has not been connected" }, 503);
  const previous = await readNtuLearnStatus(bucket);
  const lastRequest = previous.requestedAt ? Date.parse(previous.requestedAt) : 0;
  const cooldownMs = 30 * 60 * 1000;
  if (["queued", "running"].includes(previous.state)) return json({ accepted: true, status: previous }, 202);
  if (Number.isFinite(lastRequest) && Date.now() - lastRequest < cooldownMs) {
    return json({ accepted: false, retryAfter: Math.ceil((cooldownMs - (Date.now() - lastRequest)) / 1000), status: previous }, 429);
  }
  const status = { state: "queued", requestedAt: new Date().toISOString(), startedAt: null, finishedAt: null, message: "同步请求已发送" };
  await writeNtuLearnStatus(bucket, status);
  try {
    const collectorStatus = await triggerNtuLearnRefresh(env);
    const latest = await readNtuLearnStatus(bucket);
    const finalStatus = latest.state === "queued" && collectorStatus && typeof collectorStatus.state === "string"
      ? { ...status, ...collectorStatus }
      : latest;
    if (finalStatus !== latest) await writeNtuLearnStatus(bucket, finalStatus);
    return json({ accepted: true, status: publicNtuLearnStatus(finalStatus) });
  } catch {
    const failed = { ...status, state: "error", finishedAt: new Date().toISOString(), message: "Collector request failed" };
    await writeNtuLearnStatus(bucket, failed);
    return json({ accepted: false, status: publicNtuLearnStatus(failed), error: "NTULearn sync failed" }, 502);
  }
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
  async fetch(request, env, ctx) {
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
    if (url.pathname === "/api/ntulearn" && request.method === "GET") {
      const bucket = requireBucket(env);
      if (!bucket) return json({ error: "NTULearn storage unavailable" }, 503);
      const snapshot = await readNtuLearnSnapshot(bucket);
      return json(owner ? snapshot : publicNtuLearnSummary(snapshot));
    }
    if (url.pathname === "/api/ntulearn/status" && request.method === "GET") {
      const bucket = requireBucket(env);
      if (!bucket) return json({ error: "NTULearn storage unavailable" }, 503);
      return json(publicNtuLearnStatus(await readNtuLearnStatus(bucket)));
    }
    if (url.pathname === "/api/ntulearn/refresh" && request.method === "POST") return requestNtuLearnRefresh(env);
    if (url.pathname === "/api/upload" && request.method === "POST") return uploadFromBrowser(request, env, url);
    if (url.pathname === "/api/admin/materials" && request.method === "POST") return uploadFromSync(request, env, url);
    if (url.pathname === "/api/admin/schedule" && request.method === "PUT") return updateSchedule(request, env);
    if (url.pathname === "/api/admin/ntulearn" && request.method === "PUT") return updateNtuLearnSnapshot(request, env);
    if (url.pathname === "/api/admin/ntulearn/status" && request.method === "PUT") return updateNtuLearnStatus(request, env);

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
