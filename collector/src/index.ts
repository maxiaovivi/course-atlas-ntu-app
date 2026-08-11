import { acquire, connect, launch, type BrowserContextOptions } from "@cloudflare/playwright";

interface Env {
  BROWSER: Fetcher;
  STATE: KVNamespace;
  COLLECTOR_TOKEN: string;
  SESSION_ENCRYPTION_KEY: string;
  SITES_UPLOAD_TOKEN: string;
  SITES_BYPASS_TOKEN?: string;
  SITES_URL: string;
  AUTO_SYNC_ENABLED?: string;
  COURSE_CODE_MAP?: string;
}

type SyncState = "idle" | "running" | "success" | "login_required" | "error";
type Course = { id: string; code: string; name: string };
type FeedItem = {
  id: string;
  courseCode: string;
  type: "announcement" | "material" | "assignment";
  title: string;
  url: string;
  publishedAt: string | null;
  updatedAt: string | null;
  dueAt: string | null;
};

const NTULEARN_ORIGIN = "https://ntulearn.ntu.edu.sg";
const SESSION_KEY = "ntu-session-v1";
const LOGIN_SESSION_KEY = "ntu-login-session-v1";
const STATUS_KEY = "collector-status-v1";

function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
}

function safeEqual(left = "", right = "") {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  let mismatch = a.length ^ b.length;
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) mismatch |= (a[index] || 0) ^ (b[index] || 0);
  return mismatch === 0;
}

function authorized(request: Request, env: Env) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  return Boolean(env.COLLECTOR_TOKEN && safeEqual(token, env.COLLECTOR_TOKEN));
}

function decodeBase64(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function encodeBase64(value: Uint8Array) {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function encryptionKey(env: Env) {
  const raw = decodeBase64(env.SESSION_ENCRYPTION_KEY || "");
  if (raw.byteLength !== 32) throw new Error("SESSION_ENCRYPTION_KEY must decode to 32 bytes");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function encryptState(env: Env, value: BrowserContextOptions["storageState"]) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(env), bytes);
  return JSON.stringify({ version: 1, iv: encodeBase64(iv), data: encodeBase64(new Uint8Array(encrypted)) });
}

async function decryptState(env: Env) {
  const stored = await env.STATE.get(SESSION_KEY);
  if (!stored) return undefined;
  const payload = JSON.parse(stored) as { version: number; iv: string; data: string };
  const clear = await crypto.subtle.decrypt({ name: "AES-GCM", iv: decodeBase64(payload.iv) }, await encryptionKey(env), decodeBase64(payload.data));
  return JSON.parse(new TextDecoder().decode(clear)) as BrowserContextOptions["storageState"];
}

async function setStatus(env: Env, state: SyncState, message: string | null) {
  const status = { state, message, updatedAt: new Date().toISOString() };
  await env.STATE.put(STATUS_KEY, JSON.stringify(status), { expirationTtl: 7 * 24 * 60 * 60 });
  if (state === "running" || state === "login_required" || state === "error") {
    await postSites(env, "/api/admin/ntulearn/status", { state, message });
  }
  return status;
}

async function postSites(env: Env, path: string, body: unknown) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-upload-token": env.SITES_UPLOAD_TOKEN,
  };
  if (env.SITES_BYPASS_TOKEN) headers["OAI-Sites-Authorization"] = `Bearer ${env.SITES_BYPASS_TOKEN}`;
  const response = await fetch(`${env.SITES_URL.replace(/\/$/, "")}${path}`, { method: "PUT", headers, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`Sites callback failed (${response.status})`);
}

function courseCodeMap(env: Env) {
  try { return JSON.parse(env.COURSE_CODE_MAP || "{}") as Record<string, string>; } catch { return {}; }
}

function deriveCode(text: string, id: string, map: Record<string, string>) {
  const mapped = map[id];
  if (mapped && /^[A-Z]{2,4}\d{4}[A-Z]?$/.test(mapped)) return mapped;
  return text.toUpperCase().match(/\b[A-Z]{2,4}\d{4}[A-Z]?\b/)?.[0] || null;
}

function absoluteNtuLearnUrl(value: string) {
  const url = new URL(value, NTULEARN_ORIGIN);
  if (url.origin !== NTULEARN_ORIGIN) throw new Error("Unexpected external NTULearn URL");
  url.hash = "";
  return url.toString();
}

async function discoverCourses(page: Awaited<ReturnType<Awaited<ReturnType<typeof launch>>["newPage"]>>, env: Env): Promise<Course[]> {
  await page.goto(`${NTULEARN_ORIGIN}/ultra/course`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  if (new URL(page.url()).hostname !== "ntulearn.ntu.edu.sg") return [];
  const links = await page.locator('a[href*="/ultra/courses/"]').evaluateAll((nodes) => nodes.map((node) => ({
    href: (node as HTMLAnchorElement).href,
    text: (node.textContent || "").replace(/\s+/g, " ").trim(),
  })));
  const map = courseCodeMap(env);
  const courses = new Map<string, Course>();
  for (const link of links) {
    const id = link.href.match(/\/ultra\/courses\/([^/?#]+)/)?.[1];
    if (!id || courses.has(id)) continue;
    const code = deriveCode(link.text, id, map);
    if (code) courses.set(id, { id, code, name: link.text.slice(0, 240) || code });
  }
  return [...courses.values()];
}

async function collectAnnouncements(page: Parameters<typeof discoverCourses>[0], course: Course): Promise<FeedItem[]> {
  const url = `${NTULEARN_ORIGIN}/ultra/courses/${encodeURIComponent(course.id)}/announcements`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  const records = await page.locator("article, li").evaluateAll((nodes) => nodes.map((node, index) => {
    const titleNode = node.querySelector("h1,h2,h3,h4,[class*=title]");
    const linkNode = node.querySelector("a[href]") as HTMLAnchorElement | null;
    const timeNode = node.querySelector("time") as HTMLTimeElement | null;
    return {
      index,
      title: (titleNode?.textContent || "").replace(/\s+/g, " ").trim(),
      href: linkNode?.href || "",
      datetime: timeNode?.dateTime || null,
    };
  }));
  return records.filter((record) => record.title && record.href.includes("ntulearn.ntu.edu.sg")).slice(0, 100).map((record) => ({
    id: `announcement:${course.id}:${record.index}:${record.title.slice(0, 80)}`,
    courseCode: course.code,
    type: "announcement",
    title: record.title.slice(0, 300),
    url: absoluteNtuLearnUrl(record.href || url),
    publishedAt: record.datetime && Number.isFinite(Date.parse(record.datetime)) ? new Date(record.datetime).toISOString() : null,
    updatedAt: null,
    dueAt: null,
  }));
}

async function runSync(env: Env) {
  await setStatus(env, "running", "正在读取 NTULearn");
  let browser: Awaited<ReturnType<typeof launch>> | undefined;
  try {
    const storageState = await decryptState(env);
    if (!storageState) {
      await setStatus(env, "login_required", "需要先完成一次 NTULearn 登录");
      return;
    }
    browser = await launch(env.BROWSER);
    const context = await browser.newContext({ storageState });
    const page = await context.newPage();
    const courses = await discoverCourses(page, env);
    if (!courses.length) {
      await setStatus(env, "login_required", "NTULearn 会话已失效，请重新登录");
      return;
    }
    const items: FeedItem[] = [];
    for (const course of courses) items.push(...await collectAnnouncements(page, course));
    const updatedState = await context.storageState({ indexedDB: true });
    await env.STATE.put(SESSION_KEY, await encryptState(env, updatedState));
    await postSites(env, "/api/admin/ntulearn", { version: 1, collectedAt: new Date().toISOString(), courses, items });
    await setStatus(env, "success", `已同步 ${courses.length} 门课程、${items.length} 条更新`);
  } catch (error) {
    await setStatus(env, "error", error instanceof Error ? error.message.slice(0, 220) : "同步失败");
  } finally {
    await browser?.close().catch(() => undefined);
  }
}

async function startLogin(env: Env) {
  const { sessionId } = await acquire(env.BROWSER, { keep_alive: 600_000 });
  const browser = await connect(env.BROWSER, sessionId);
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${NTULEARN_ORIGIN}/ultra/course`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  const cdp = await context.newCDPSession(page);
  const live = await cdp.send("Cloudflare.getLiveView", { mode: "tab", expiresInMs: 15 * 60 * 1000 }) as { devtoolsFrontendUrl: string };
  await env.STATE.put(LOGIN_SESSION_KEY, sessionId, { expirationTtl: 15 * 60 });
  await browser.close();
  return live.devtoolsFrontendUrl;
}

async function finishLogin(env: Env) {
  const sessionId = await env.STATE.get(LOGIN_SESSION_KEY);
  if (!sessionId) throw new Error("登录窗口已过期，请重新开始");
  const browser = await connect(env.BROWSER, sessionId);
  try {
    const context = browser.contexts()[0];
    if (!context) throw new Error("找不到登录会话");
    const pages = context.pages();
    const page = pages.at(-1);
    if (!page) throw new Error("找不到登录页面");
    await page.goto(`${NTULEARN_ORIGIN}/ultra/course`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    if (new URL(page.url()).hostname !== "ntulearn.ntu.edu.sg"
      || await page.locator('a[href*="/ultra/courses/"]').count() === 0) throw new Error("NTULearn 登录尚未完成");
    const storageState = await context.storageState({ indexedDB: true });
    await env.STATE.put(SESSION_KEY, await encryptState(env, storageState));
    await env.STATE.delete(LOGIN_SESSION_KEY);
    return { ok: true };
  } finally {
    await browser.close();
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    if (!authorized(request, env)) return json({ error: "Unauthorized" }, 401);
    const url = new URL(request.url);
    if (url.pathname === "/refresh" && request.method === "POST") {
      ctx.waitUntil(runSync(env));
      return json({ accepted: true }, 202);
    }
    if (url.pathname === "/status" && request.method === "GET") {
      return json(JSON.parse(await env.STATE.get(STATUS_KEY) || '{"state":"idle","message":null,"updatedAt":null}'));
    }
    if (url.pathname === "/login/start" && request.method === "POST") return json({ url: await startLogin(env) });
    if (url.pathname === "/login/finish" && request.method === "POST") return json(await finishLogin(env));
    return json({ error: "Not found" }, 404);
  },

  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    if (env.AUTO_SYNC_ENABLED === "1") ctx.waitUntil(runSync(env));
  },
};
