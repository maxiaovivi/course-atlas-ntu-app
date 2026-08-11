import { acquire, connect, launch, type BrowserContextOptions } from "@cloudflare/playwright";

interface Env {
  BROWSER: Fetcher;
  STATE: KVNamespace;
  COLLECTOR_TOKEN: string;
  SESSION_ENCRYPTION_KEY: string;
  SITES_UPLOAD_TOKEN: string;
  SITES_BYPASS_TOKEN?: string;
  SITES_URL: string;
  TARGET_COURSE_ID?: string;
  TARGET_COURSE_CODE?: string;
  TARGET_COURSE_NAME?: string;
  MAX_COURSES?: string;
  MAX_ITEMS_PER_COURSE?: string;
}

type SyncState = "idle" | "running" | "success" | "login_required" | "error";
type SyncStatus = { state: SyncState; message: string | null; updatedAt: string };
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

const ERROR = {
  collectorMisconfigured: "COLLECTOR_MISCONFIGURED",
  loginIncomplete: "LOGIN_INCOMPLETE",
  loginRequired: "NTULEARN_LOGIN_REQUIRED",
  loginSessionExpired: "LOGIN_SESSION_EXPIRED",
  sitesCallbackFailed: "SITES_CALLBACK_FAILED",
} as const;

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

async function setStatus(env: Env, state: SyncState, message: string | null, persist = true): Promise<SyncStatus> {
  const status = { state, message, updatedAt: new Date().toISOString() };
  if (persist) await env.STATE.put(STATUS_KEY, JSON.stringify(status), { expirationTtl: 7 * 24 * 60 * 60 });
  if (state === "running" || state === "login_required" || state === "error") {
    await postSites(env, "/api/admin/ntulearn/status", { state, message }).catch(() => undefined);
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
  if (!response.ok) throw new Error(ERROR.sitesCallbackFailed);
}

function safeSyncFailure(error: unknown): { state: "login_required" | "error"; message: string } {
  const value = error instanceof Error ? error.message : "";
  if (value === ERROR.loginRequired || value === ERROR.loginIncomplete) {
    return { state: "login_required", message: "NTULearn 会话已失效，请重新登录" };
  }
  if (value === ERROR.collectorMisconfigured) {
    return { state: "error", message: "采集器没有配置有效的目标课程" };
  }
  if (value === ERROR.sitesCallbackFailed) {
    return { state: "error", message: "同步结果暂时无法保存，请稍后重试" };
  }
  if (/429|browser time limit|too many requests|unable to create new browser/i.test(value)) {
    return { state: "error", message: "云端浏览器额度暂时不可用，请稍后重试" };
  }
  return { state: "error", message: "同步失败，请稍后重试" };
}

function safeLoginFailure(error: unknown): { message: string; status: number } {
  const value = error instanceof Error ? error.message : "";
  if (value === ERROR.loginIncomplete) return { message: "NTULearn 登录尚未完成", status: 409 };
  if (value === ERROR.loginSessionExpired) return { message: "登录窗口已过期，请重新开始", status: 410 };
  if (value === ERROR.collectorMisconfigured) return { message: "采集器没有配置有效的目标课程", status: 503 };
  if (/429|browser time limit|too many requests|unable to create new browser/i.test(value)) {
    return { message: "云端浏览器额度暂时不可用，请稍后重试", status: 503 };
  }
  return { message: "远程登录暂时不可用，请重新开始", status: 503 };
}

function boundedInteger(value: string | undefined, fallback: number, maximum: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
}

function absoluteNtuLearnUrl(value: string) {
  const url = new URL(value, NTULEARN_ORIGIN);
  if (url.origin !== NTULEARN_ORIGIN) throw new Error("Unexpected external NTULearn URL");
  url.search = "";
  url.hash = "";
  return url.toString();
}

function configuredCourses(env: Env): Course[] {
  const id = env.TARGET_COURSE_ID || "";
  const code = env.TARGET_COURSE_CODE || "";
  const name = env.TARGET_COURSE_NAME || "";
  if (!/^_[0-9]+_1$/.test(id) || !/^[A-Z]{2,4}\d{4}[A-Z]?$/.test(code) || !name || name.length > 240) return [];
  return [{ id, code, name }];
}

type CollectorPage = Awaited<ReturnType<Awaited<ReturnType<typeof launch>>["newPage"]>>;
type CollectorContext = ReturnType<Awaited<ReturnType<typeof connect>>["contexts"]>[number];

async function verifyTargetCourseAccess(page: CollectorPage, course: Course) {
  const targetUrl = `${NTULEARN_ORIGIN}/ultra/courses/${encodeURIComponent(course.id)}/outline`;
  try {
    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
  } catch {
    if (new URL(page.url()).hostname !== "ntulearn.ntu.edu.sg") return false;
  }
  if (new URL(page.url()).hostname !== "ntulearn.ntu.edu.sg") return false;

  const apiConfirmed = await page.evaluate(async ({ courseId }) => {
    const encoded = encodeURIComponent(courseId);
    const paths = [
      `/learn/api/v1/courses/${encoded}/announcements?limit=1`,
      `/learn/api/v1/courses/${encoded}/contents`,
      `/learn/api/public/v1/courses/${encoded}`,
    ];
    for (const path of paths) {
      try {
        const response = await fetch(path, { credentials: "include", headers: { Accept: "application/json" } });
        if (response.ok) return true;
      } catch { /* A rendered target-course page can still prove access. */ }
    }
    return false;
  }, { courseId: course.id });
  if (apiConfirmed) return true;

  try {
    await page.waitForFunction(({ courseId, courseCode, courseName }) => {
      if (location.hostname !== "ntulearn.ntu.edu.sg") return false;
      const text = (document.body?.innerText || "").replace(/\s+/g, " ").toUpperCase();
      const expectedName = courseName.toUpperCase();
      const matchingLink = document.querySelector(`a[href*="/ultra/courses/${courseId}/"]`);
      return Boolean(matchingLink) || text.includes(courseCode) || text.includes(expectedName);
    }, { courseId: course.id, courseCode: course.code, courseName: course.name }, { timeout: 15_000 });
    return true;
  } catch {
    return false;
  }
}

async function findAuthenticatedLoginPage(browser: Awaited<ReturnType<typeof connect>>, course: Course): Promise<{ context: CollectorContext; page: CollectorPage }> {
  const contexts = browser.contexts();
  const candidates = contexts.map((context) => {
    const pages = context.pages();
    const ntuPage = [...pages].reverse().find((page) => {
      try { return new URL(page.url()).hostname === "ntulearn.ntu.edu.sg"; } catch { return false; }
    });
    return { context, page: ntuPage || pages.at(-1), priority: ntuPage ? 1 : 0 };
  }).filter((candidate): candidate is { context: CollectorContext; page: CollectorPage; priority: number } => Boolean(candidate.page))
    .sort((left, right) => right.priority - left.priority);

  for (const candidate of candidates) {
    if (await verifyTargetCourseAccess(candidate.page, course)) return candidate;
  }

  const context = contexts[0] || await browser.newContext();
  const page = await context.newPage();
  if (await verifyTargetCourseAccess(page, course)) return { context, page };
  throw new Error(ERROR.loginIncomplete);
}

async function collectAnnouncements(page: CollectorPage, course: Course, limit: number): Promise<FeedItem[]> {
  const url = `${NTULEARN_ORIGIN}/ultra/courses/${encodeURIComponent(course.id)}/announcements`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20_000 });
  if (new URL(page.url()).hostname !== "ntulearn.ntu.edu.sg") throw new Error(ERROR.loginRequired);
  const apiRecords = await page.evaluate(async ({ courseId, itemLimit }) => {
    const paths = [
      `/learn/api/v1/courses/${encodeURIComponent(courseId)}/announcements?limit=${itemLimit}`,
      `/learn/api/public/v1/courses/${encodeURIComponent(courseId)}/announcements?limit=${itemLimit}`,
    ];
    for (const path of paths) {
      try {
        const response = await fetch(path, { credentials: "include", headers: { Accept: "application/json" } });
        if (!response.ok) continue;
        const payload = await response.json() as { results?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>;
        const records = Array.isArray(payload) ? payload : payload.results;
        if (Array.isArray(records)) return records.slice(0, itemLimit);
      } catch { /* Try the next read-only endpoint. */ }
    }
    return [];
  }, { courseId: course.id, itemLimit: limit });
  if (apiRecords.length) return apiRecords.map((record, index) => {
    const id = typeof record.id === "string" ? record.id : `${index}`;
    const title = typeof record.title === "string" ? record.title : typeof record.subject === "string" ? record.subject : "Announcement";
    const date = (key: string) => typeof record[key] === "string" && Number.isFinite(Date.parse(record[key] as string)) ? new Date(record[key] as string).toISOString() : null;
    return {
      id: `announcement:${course.id}:${id}`,
      courseCode: course.code,
      type: "announcement" as const,
      title: title.replace(/\s+/g, " ").trim().slice(0, 300),
      url,
      publishedAt: date("created") || date("publishDate"),
      updatedAt: date("modified"),
      dueAt: null,
    };
  });
  await page.waitForTimeout(1_500);
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
  return records.filter((record) => record.title && record.href.includes("ntulearn.ntu.edu.sg")).slice(0, limit).map((record) => ({
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

async function runSync(env: Env): Promise<SyncStatus> {
  let browser: Awaited<ReturnType<typeof launch>> | undefined;
  try {
    const storageState = await decryptState(env);
    if (!storageState) {
      return await setStatus(env, "login_required", "需要先完成一次 NTULearn 登录");
    }
    const courses = configuredCourses(env).slice(0, boundedInteger(env.MAX_COURSES, 1, 32));
    if (!courses.length) throw new Error(ERROR.collectorMisconfigured);

    // The HTTP request remains open until the one-shot sync finishes. The
    // transient running state is sent to Sites but is not written to KV, so a
    // fast terminal transition cannot exceed KV's one-write-per-key limit.
    await setStatus(env, "running", "正在读取 NTULearn", false);
    browser = await launch(env.BROWSER);
    const context = await browser.newContext({ storageState });
    const page = await context.newPage();
    if (!await verifyTargetCourseAccess(page, courses[0])) throw new Error(ERROR.loginRequired);
    const items: FeedItem[] = [];
    const itemLimit = boundedInteger(env.MAX_ITEMS_PER_COURSE, 10, 100);
    for (const course of courses) items.push(...await collectAnnouncements(page, course, itemLimit));
    const updatedState = await context.storageState({ indexedDB: true });
    await env.STATE.put(SESSION_KEY, await encryptState(env, updatedState));
    await postSites(env, "/api/admin/ntulearn", { version: 1, collectedAt: new Date().toISOString(), courses, items });
    return await setStatus(env, "success", `已同步 ${courses.length} 门课程、${items.length} 条更新`);
  } catch (error) {
    const failure = safeSyncFailure(error);
    return await setStatus(env, failure.state, failure.message);
  } finally {
    await browser?.close().catch(() => undefined);
  }
}

async function startLogin(env: Env) {
  const { sessionId } = await acquire(env.BROWSER, { keep_alive: 600_000 });
  const browser = await connect(env.BROWSER, sessionId);
  const context = browser.contexts()[0] || await browser.newContext();
  const page = context.pages()[0] || await context.newPage();
  await page.goto(`${NTULEARN_ORIGIN}/ultra/course`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  const cdp = await context.newCDPSession(page);
  const live = await cdp.send("Cloudflare.getLiveView", { mode: "tab", expiresInMs: 15 * 60 * 1000 }) as { devtoolsFrontendUrl: string };
  await env.STATE.put(LOGIN_SESSION_KEY, sessionId, { expirationTtl: 15 * 60 });
  // Do not call browser.close() here. In the current Cloudflare Playwright CDP
  // transport it closes the persistent target backing Live View. Request
  // teardown releases this Worker connection while keep_alive preserves the
  // remote session for the human login window.
  return live.devtoolsFrontendUrl;
}

async function finishLogin(env: Env) {
  const sessionId = await env.STATE.get(LOGIN_SESSION_KEY);
  if (!sessionId) throw new Error(ERROR.loginSessionExpired);
  const browser = await connect(env.BROWSER, sessionId);
  try {
    const course = configuredCourses(env)[0];
    if (!course) throw new Error(ERROR.collectorMisconfigured);
    const { context, page } = await findAuthenticatedLoginPage(browser, course);
    const storageState = await context.storageState({ indexedDB: true });
    await env.STATE.put(SESSION_KEY, await encryptState(env, storageState));
    await env.STATE.delete(LOGIN_SESSION_KEY);
    const cdp = await context.newCDPSession(page);
    await cdp.send("Browser.close").catch(() => undefined);
    return { ok: true };
  } finally {
    await browser.close().catch(() => undefined);
  }
}

export default {
  async fetch(request: Request, env: Env) {
    if (!authorized(request, env)) return json({ error: "Unauthorized" }, 401);
    const url = new URL(request.url);
    if (url.pathname === "/refresh" && request.method === "POST") {
      const status = await runSync(env);
      return json({ accepted: true, status });
    }
    if (url.pathname === "/status" && request.method === "GET") {
      try {
        return json(JSON.parse(await env.STATE.get(STATUS_KEY) || '{"state":"idle","message":null,"updatedAt":null}'));
      } catch {
        return json({ state: "idle", message: null, updatedAt: null });
      }
    }
    if (url.pathname === "/login/start" && request.method === "POST") {
      try {
        return json({ url: await startLogin(env) });
      } catch (error) {
        const failure = safeLoginFailure(error);
        return json({ error: failure.message }, failure.status);
      }
    }
    if (url.pathname === "/login/finish" && request.method === "POST") {
      try {
        return json(await finishLogin(env));
      } catch (error) {
        const failure = safeLoginFailure(error);
        return json({ error: failure.message }, failure.status);
      }
    }
    return json({ error: "Not found" }, 404);
  },
};
