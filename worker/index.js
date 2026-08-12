const CATALOG_KEY = "library/catalog-v1.json";
const SCHEDULE_KEY = "app/schedule-v1.json";
const STUDY_CARDS_KEY = "app/study-cards-v1.json";
const CALENDAR_KEY = "app/ntulearn-calendar-v1.json";
const CALENDAR_STATUS_KEY = "app/ntulearn-calendar-status-v1.json";
const ALLOWED_COURSES = new Set(["EE6221", "EE6406", "EE6407", "EE6497"]);
const ALLOWED_SHELVES = new Set(["Lectures", "Assignments", "Study aids", "Quiz", "Exams"]);
const CALENDAR_COURSE_ALIASES = {
  EE6221: ["robotics and intelligent sensors"],
  EE6406: ["analytic and ensemble machine learning"],
  EE6407: ["genetic algorithms and machine learning"],
  EE6497: ["pattern recognition and deep learning"],
};
const CALENDAR_COURSES = new Set([...ALLOWED_COURSES, "NTU"]);
const MAX_ICAL_BYTES = 1024 * 1024;
const MAX_ICAL_EVENTS = 2000;
const MAX_PUBLIC_EVENTS = 512;
const CALENDAR_SUCCESS_COOLDOWN_MS = 10 * 60 * 1000;
const CALENDAR_FAILURE_BACKOFF_MS = 60 * 1000;
const MAX_STUDY_CARDS = 128;
const MAX_STUDY_CARDS_BYTES = 256 * 1024;
let calendarRefreshInFlight = null;

export const DEFAULT_SCHEDULE = {
  version: 1,
  academicYear: "AY2030-31",
  semester: 1,
  timezone: "Asia/Singapore",
  updatedAt: "2030-08-01T00:00:00+08:00",
  source: "Fictional example data",
  teachingStart: "2030-08-12",
  teachingEnd: "2030-11-16",
  teachingBreaks: [
    {
      id: "fictional-midterm-break",
      start: "2030-09-29",
      end: "2030-10-05",
      label: "Fictional midterm break",
    },
  ],
  academicCalendar: [
    {
      id: "fictional-recess-period",
      kind: "recess",
      title: "Fictional recess period",
      start: "2030-09-29",
      end: "2030-10-05",
    },
    {
      id: "fictional-public-holiday",
      kind: "holiday",
      title: "Fictional public holiday",
      start: "2030-10-21",
      end: "2030-10-21",
    },
    {
      id: "fictional-examination-period",
      kind: "exam",
      title: "Fictional examination period",
      start: "2030-11-18",
      end: "2030-12-02",
    },
    {
      id: "fictional-semester-vacation",
      kind: "vacation",
      title: "Fictional semester vacation",
      start: "2030-12-09",
      end: "2031-01-05",
    },
  ],
  courseBriefs: [
    {
      courseCode: "EX1001",
      previousDate: "2030-08-12",
      previous: ["Fictional worksheet A"],
      nextDate: "2030-08-19",
      next: ["Read fictional chapter 2", "Bring the fictional lab notes"],
    },
    {
      courseCode: "EX2002",
      previousDate: null,
      previous: [],
      nextDate: "2030-08-21",
      next: ["Review the fictional data example"],
    },
  ],
  courses: [
    {
      code: "EX1001",
      name: "Fictional Systems Studio",
      zh: "示例系统课程",
      weekday: 1,
      dayLabel: "周一",
      start: "09:00",
      end: "10:30",
      section: null,
      category: "General",
      location: "Example Hall A",
      locationStatus: "confirmed",
      locationSource: "Fictional fixture",
      note: "This course exists only to exercise the public schema.",
    },
    {
      code: "EX2002",
      name: "Fictional Data Methods",
      zh: "示例数据方法",
      weekday: 3,
      dayLabel: "周三",
      start: "14:00",
      end: "15:30",
      section: "Group A",
      category: "Specialized",
      location: "To be announced",
      locationStatus: "pending",
      locationSource: "Fictional fixture",
      note: null,
    },
  ],
  exceptions: [
    {
      id: "ex1001-fictional-makeup",
      courseCode: "EX1001",
      date: "2030-08-19",
      start: "11:00",
      end: "12:00",
      label: "Fictional make-up class",
      location: "Example Video Room",
      note: "Fixture content; not a real class.",
      replacesDate: "2030-08-18",
    },
  ],
  agenda: [
    {
      id: "ex1001-fictional-quiz",
      type: "quiz",
      courseCode: "EX1001",
      title: "Fictional Quiz 1",
      start: "2030-09-10T01:30:00.000Z",
      end: "2030-09-10T02:00:00.000Z",
      location: "Example Hall A",
      certainty: "confirmed",
      detail: "Fixture content; not a real assessment.",
    },
    {
      id: "fictional-recess-week",
      type: "academic",
      courseCode: null,
      title: "Fictional recess week",
      start: "2030-09-29",
      end: "2030-10-05",
      location: null,
      certainty: "confirmed",
      detail: "Fixture content; not a real academic-calendar entry.",
    },
    {
      id: "ex2002-fictional-notice",
      type: "notice",
      courseCode: "EX2002",
      title: "Fictional equipment notice",
      start: null,
      end: null,
      location: null,
      certainty: "pending",
      detail: "Fixture content; not a real course notice.",
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

function isSchedule(value) {
  if (!value || typeof value !== "object" || value.version !== 1 || value.timezone !== "Asia/Singapore") return false;
  if (typeof value.academicYear !== "string" || value.academicYear.length > 32) return false;
  if (!Number.isInteger(value.semester) || value.semester < 1 || value.semester > 3) return false;
  if (typeof value.updatedAt !== "string" || !Number.isFinite(Date.parse(value.updatedAt))) return false;
  if (typeof value.source !== "string" || !value.source || value.source.length > 240) return false;
  if (!Array.isArray(value.courses) || value.courses.length > 32
    || !Array.isArray(value.exceptions) || value.exceptions.length > 128
    || !Array.isArray(value.agenda) || value.agenda.length > 256) return false;
  const time = /^([01]\d|2[0-3]):[0-5]\d$/;
  const text = (item, key, max = 240) => typeof item[key] === "string" && item[key].length > 0 && item[key].length <= max;
  const nullableText = (item, key, max = 500) => item[key] === null || (typeof item[key] === "string" && item[key].length <= max);
  const teachingBoundsConfigured = value.teachingStart !== undefined || value.teachingEnd !== undefined;
  if (teachingBoundsConfigured && (!isCalendarDate(value.teachingStart) || !isCalendarDate(value.teachingEnd)
    || value.teachingStart > value.teachingEnd)) return false;
  if (value.teachingBreaks !== undefined && (!Array.isArray(value.teachingBreaks) || value.teachingBreaks.length > 32
    || !value.teachingBreaks.every((item) => item && typeof item === "object"
      && /^[a-z0-9-]{8,120}$/.test(item.id)
      && isCalendarDate(item.start) && isCalendarDate(item.end) && item.start <= item.end
      && text(item, "label", 120)))) return false;
  if (value.academicCalendar !== undefined) {
    if (!Array.isArray(value.academicCalendar) || value.academicCalendar.length > 64
      || !value.academicCalendar.every((item) => item && typeof item === "object"
        && Object.keys(item).length === 5
        && Object.keys(item).every((key) => ["id", "kind", "title", "start", "end"].includes(key))
        && /^[a-z0-9-]{8,120}$/.test(item.id)
        && ["holiday", "recess", "exam", "vacation"].includes(item.kind)
        && text(item, "title", 120)
        && isCalendarDate(item.start) && isCalendarDate(item.end) && item.start <= item.end)
      || new Set(value.academicCalendar.map((item) => item.id)).size !== value.academicCalendar.length) return false;
  }
  if (!value.courses.every((course) => course && typeof course === "object"
    && /^[A-Z]{2,4}\d{4}[A-Z]?$/.test(course.code)
    && text(course, "name") && text(course, "zh")
    && Number.isInteger(course.weekday) && course.weekday >= 0 && course.weekday <= 6
    && text(course, "dayLabel", 8) && time.test(course.start) && time.test(course.end)
    && nullableText(course, "section", 80) && ["General", "Specialized"].includes(course.category)
    && text(course, "location") && ["confirmed", "pending"].includes(course.locationStatus)
    && text(course, "locationSource") && nullableText(course, "note"))) return false;
  const courseCodes = new Set(value.courses.map((course) => course.code));
  if (value.courseBriefs !== undefined) {
    const validBriefList = (items) => Array.isArray(items) && items.length <= 3
      && items.every((item) => typeof item === "string" && item.length > 0 && item.length <= 120
        && item.trim() === item && !/[\u0000-\u001f\u007f]/.test(item))
      && new Set(items).size === items.length;
    const validBriefDate = (date) => date === null || isCalendarDate(date);
    if (!Array.isArray(value.courseBriefs) || value.courseBriefs.length > 32
      || !value.courseBriefs.every((item) => item && typeof item === "object"
        && Object.keys(item).length === 5
        && Object.keys(item).every((key) => ["courseCode", "previousDate", "previous", "nextDate", "next"].includes(key))
        && courseCodes.has(item.courseCode)
        && validBriefDate(item.previousDate) && validBriefList(item.previous)
        && validBriefDate(item.nextDate) && validBriefList(item.next)
        && (item.previous.length > 0 || item.next.length > 0)
        && ((item.previous.length === 0 && item.previousDate === null)
          || (item.previous.length > 0 && item.previousDate !== null))
        && ((item.next.length === 0 && item.nextDate === null)
          || (item.next.length > 0 && item.nextDate !== null))
        && (item.previousDate === null || item.nextDate === null || item.previousDate < item.nextDate))
      || new Set(value.courseBriefs.map((item) => item.courseCode)).size !== value.courseBriefs.length) return false;
  }
  const validExceptions = value.exceptions.every((exception) => exception && typeof exception === "object"
    && /^[a-z0-9-]{8,120}$/.test(exception.id)
    && courseCodes.has(exception.courseCode) && isCalendarDate(exception.date)
    && time.test(exception.start) && time.test(exception.end)
    && text(exception, "label", 120) && text(exception, "location") && text(exception, "note", 500)
    && (exception.replacesDate === undefined || isCalendarDate(exception.replacesDate)));
  if (!validExceptions) return false;
  return value.agenda.every((item) => item && typeof item === "object"
    && /^[a-z0-9-]{8,120}$/.test(item.id)
    && ["quiz", "ca", "deadline", "academic", "notice"].includes(item.type)
    && (item.courseCode === null || courseCodes.has(item.courseCode))
    && text(item, "title", 180)
    && (item.start === null || isIsoOrDate(item.start))
    && (item.end === null || isIsoOrDate(item.end))
    && (item.start === null || item.end === null || Date.parse(item.end) >= Date.parse(item.start))
    && nullableText(item, "location", 240)
    && ["confirmed", "inferred", "pending"].includes(item.certainty)
    && nullableText(item, "detail", 1000));
}

function scheduleFromEnvironment(env) {
  const single = env?.COURSE_ATLAS_DATA_JSON;
  const singleConfigured = single !== undefined && single !== null && single !== "";
  const chunks = Array.from({ length: 8 }, (_, index) => env?.[`COURSE_ATLAS_DATA_JSON_${index + 1}`]);
  const chunkConfigured = chunks.some((value) => value !== undefined && value !== null && value !== "");
  if (!singleConfigured && !chunkConfigured) return { configured: false, schedule: null };
  if (singleConfigured && chunkConfigured) return { configured: true, schedule: null };

  let raw = single;
  if (chunkConfigured) {
    const contiguous = [];
    let reachedEnd = false;
    for (const value of chunks) {
      const present = value !== undefined && value !== null && value !== "";
      if (!present) {
        reachedEnd = true;
        continue;
      }
      if (reachedEnd || typeof value !== "string" || new TextEncoder().encode(value).length > 4 * 1024) {
        return { configured: true, schedule: null };
      }
      contiguous.push(value);
    }
    raw = contiguous.join("");
  }

  if (typeof raw !== "string" || new TextEncoder().encode(raw).length > 128 * 1024) return { configured: true, schedule: null };
  try {
    const schedule = JSON.parse(raw);
    return { configured: true, schedule: isSchedule(schedule) ? schedule : null };
  } catch {
    return { configured: true, schedule: null };
  }
}

async function readSchedule(bucket, env) {
  const environment = scheduleFromEnvironment(env);
  if (environment.configured) return environment.schedule;
  if (!bucket) return null;
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
  return json({
    ok: true,
    updatedAt: schedule.updatedAt,
    courses: schedule.courses.length,
    exceptions: schedule.exceptions.length,
    agenda: schedule.agenda.length,
    academicCalendar: schedule.academicCalendar?.length ?? 0,
    courseBriefs: schedule.courseBriefs?.length ?? 0,
  });
}

function emptyStudyCards() {
  return { version: 1, updatedAt: null, cards: [] };
}

function cleanStudyCardText(value, maxLength) {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength
    && value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value);
}

function isStudyCards(value, allowEmpty = false) {
  if (!value || typeof value !== "object" || Object.keys(value).length !== 3
    || !Object.keys(value).every((key) => ["version", "updatedAt", "cards"].includes(key))
    || value.version !== 1
    || (value.updatedAt !== null && (typeof value.updatedAt !== "string" || !Number.isFinite(Date.parse(value.updatedAt))))
    || !Array.isArray(value.cards) || value.cards.length > MAX_STUDY_CARDS
    || (!allowEmpty && value.cards.length === 0)) return false;
  const cardKeys = ["id", "courseCode", "kind", "topic", "prompt", "answer", "latex", "terms", "trap", "signal", "targets", "priority"];
  const unsafeLatex = /\\(?:def|gdef|edef|xdef|let|futurelet|newcommand|renewcommand|providecommand|html|href|url|includegraphics|class|style|id|data)\b/i;
  const validList = (items, maxItems, maxLength, allowEmptyList = false) => Array.isArray(items)
    && items.length <= maxItems && (allowEmptyList || items.length > 0)
    && items.every((item) => cleanStudyCardText(item, maxLength))
    && new Set(items).size === items.length;
  if (!value.cards.every((card) => card && typeof card === "object"
    && Object.keys(card).length === cardKeys.length && Object.keys(card).every((key) => cardKeys.includes(key))
    && /^[a-z0-9-]{8,96}$/.test(card.id)
    && ALLOWED_COURSES.has(card.courseCode)
    && ["concept", "formula", "procedure", "term"].includes(card.kind)
    && cleanStudyCardText(card.topic, 60)
    && cleanStudyCardText(card.prompt, 120)
    && validList(card.answer, 3, 160)
    && validList(card.latex, 2, 360, true) && card.latex.every((item) => !unsafeLatex.test(item))
    && Array.isArray(card.terms) && card.terms.length <= 4
    && card.terms.every((term) => term && typeof term === "object" && Object.keys(term).length === 2
      && Object.keys(term).every((key) => ["term", "meaning"].includes(key))
      && cleanStudyCardText(term.term, 60) && cleanStudyCardText(term.meaning, 120))
    && (card.trap === null || cleanStudyCardText(card.trap, 160))
    && cleanStudyCardText(card.signal, 80)
    && validList(card.targets, 3, 32)
    && Number.isInteger(card.priority) && card.priority >= 1 && card.priority <= 3)) return false;
  return new Set(value.cards.map((card) => card.id)).size === value.cards.length;
}

async function readStudyCards(bucket) {
  if (!bucket) return null;
  const object = await bucket.get(STUDY_CARDS_KEY);
  if (!object) return emptyStudyCards();
  try {
    const parsed = JSON.parse(await object.text());
    return isStudyCards(parsed, true) ? parsed : null;
  } catch {
    return null;
  }
}

async function updateStudyCards(request, env) {
  const bucket = requireBucket(env);
  if (!bucket) return json({ error: "Study-card storage unavailable" }, 503);
  if (!isOwner(request, env)) return json({ error: "Owner sign-in is required" }, 401);
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return json({ error: "Cross-origin update is not allowed" }, 403);
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") return json({ error: "Only application/json is accepted" }, 415);
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_STUDY_CARDS_BYTES) return json({ error: "Study-card payload is too large" }, 413);
  let parsed;
  try {
    const text = await request.text();
    if (!text || new TextEncoder().encode(text).length > MAX_STUDY_CARDS_BYTES) return json({ error: "Study-card payload is empty or too large" }, 413);
    parsed = JSON.parse(text);
  } catch {
    return json({ error: "Study-card JSON is invalid" }, 400);
  }
  if (!isStudyCards(parsed)) return json({ error: "Study-card schema is invalid" }, 400);
  const snapshot = { ...parsed, updatedAt: new Date().toISOString() };
  await bucket.put(STUDY_CARDS_KEY, JSON.stringify(snapshot), {
    httpMetadata: { contentType: "application/json", cacheControl: "public, max-age=60" },
    customMetadata: { purpose: "course-atlas-study-cards", version: String(snapshot.version) },
  });
  return json({ ok: true, updatedAt: snapshot.updatedAt, cards: snapshot.cards.length, courses: new Set(snapshot.cards.map((card) => card.courseCode)).size });
}

function emptyCalendar() {
  return { version: 1, updatedAt: null, timezone: "Asia/Singapore", source: "NTULearn shared calendar", ignoredRecurring: 0, events: [] };
}

function emptyCalendarStatus() {
  return { state: "idle", attemptedAt: null, lastSuccessAt: null, eventCount: 0, errorCode: null };
}

function isIsoOrDate(value) {
  if (typeof value !== "string") return false;
  const datePrefix = /^(20\d{2})-(\d{2})-(\d{2})(?:$|T)/.exec(value);
  if (!datePrefix || !isCalendarDate(datePrefix[0].slice(0, 10))) return false;
  return datePrefix[0].length === 10 || Number.isFinite(Date.parse(value));
}

function isCalendarDate(value) {
  const match = /^(20\d{2})-(\d{2})-(\d{2})$/.exec(value || "");
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const check = new Date(Date.UTC(year, month - 1, day));
  return check.getUTCFullYear() === year && check.getUTCMonth() === month - 1 && check.getUTCDate() === day;
}

function isCalendarSnapshot(value) {
  if (!value || typeof value !== "object" || value.version !== 1 || value.timezone !== "Asia/Singapore") return false;
  if (value.updatedAt !== null && !Number.isFinite(Date.parse(value.updatedAt))) return false;
  if (value.source !== "NTULearn shared calendar" || !Number.isInteger(value.ignoredRecurring) || value.ignoredRecurring < 0) return false;
  if (!Array.isArray(value.events) || value.events.length > MAX_PUBLIC_EVENTS) return false;
  return value.events.every((event) => event && typeof event === "object"
    && /^[a-z0-9-]{20,40}$/.test(event.id)
    && CALENDAR_COURSES.has(event.courseCode)
    && typeof event.title === "string" && event.title.length > 0 && event.title.length <= 180
    && isIsoOrDate(event.start)
    && (event.end === null || isIsoOrDate(event.end))
    && typeof event.allDay === "boolean"
    && ["event", "deadline"].includes(event.kind));
}

function isCalendarStatus(value) {
  return value && typeof value === "object"
    && ["idle", "running", "success", "error"].includes(value.state)
    && (value.attemptedAt === null || Number.isFinite(Date.parse(value.attemptedAt)))
    && (value.lastSuccessAt === null || Number.isFinite(Date.parse(value.lastSuccessAt)))
    && Number.isInteger(value.eventCount) && value.eventCount >= 0
    && (value.errorCode === null || /^[a-z_]{3,48}$/.test(value.errorCode));
}

async function readCalendar(bucket) {
  const object = await bucket.get(CALENDAR_KEY);
  if (!object) return emptyCalendar();
  try {
    const value = JSON.parse(await object.text());
    return isCalendarSnapshot(value) ? value : emptyCalendar();
  } catch {
    return emptyCalendar();
  }
}

async function readCalendarStatus(bucket) {
  const object = await bucket.get(CALENDAR_STATUS_KEY);
  if (!object) return emptyCalendarStatus();
  try {
    const value = JSON.parse(await object.text());
    return isCalendarStatus(value) ? value : emptyCalendarStatus();
  } catch {
    return emptyCalendarStatus();
  }
}

async function writeCalendarStatus(bucket, value) {
  await bucket.put(CALENDAR_STATUS_KEY, JSON.stringify(value), {
    httpMetadata: { contentType: "application/json", cacheControl: "private, no-store" },
    customMetadata: { purpose: "course-atlas-calendar-status" },
  });
}

function validateCalendarFeedUrl(value) {
  if (typeof value !== "string" || value.length > 500) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "ntulearn.ntu.edu.sg" || url.port || url.username || url.password || url.search || url.hash) return null;
    if (!/^\/webapps\/calendar\/calendarFeed\/[a-f0-9]{32}\/learn\.ics$/i.test(url.pathname)) return null;
    return url;
  } catch {
    return null;
  }
}

function unfoldCalendarLines(text) {
  const physical = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const lines = [];
  for (const line of physical) {
    if (/^[ \t]/.test(line) && lines.length > 0) lines[lines.length - 1] += line.slice(1);
    else lines.push(line);
  }
  while (lines[0]?.trim() === "") lines.shift();
  while (lines.at(-1)?.trim() === "") lines.pop();
  if (lines[0]?.charCodeAt(0) === 0xfeff) lines[0] = lines[0].slice(1);
  return lines;
}

function decodeCalendarText(value) {
  return String(value || "")
    .replace(/\\[nN]/g, " ")
    .replace(/\\([,;\\])/g, "$1")
    .normalize("NFKC");
}

function normalizeCalendarTitle(value) {
  const cleaned = decodeCalendarText(value)
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (cleaned || "课程事项").slice(0, 180);
}

function normalizedCalendarSearch(value) {
  return decodeCalendarText(value).toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function courseCodeForCalendarEvent(properties) {
  const searchable = normalizedCalendarSearch([
    ...(properties.get("SUMMARY") || []).map((item) => item.value),
    ...(properties.get("CATEGORIES") || []).map((item) => item.value),
  ].join(" "));
  const compact = searchable.replace(/\s+/g, "");
  const matches = new Set();
  for (const code of ALLOWED_COURSES) {
    if (compact.includes(code.toLowerCase())) matches.add(code);
  }
  for (const [code, aliases] of Object.entries(CALENDAR_COURSE_ALIASES)) {
    if (aliases.some((alias) => searchable.includes(alias) || compact.includes(alias.replace(/\s+/g, "")))) matches.add(code);
  }
  return matches.size === 1 ? [...matches][0] : null;
}

function calendarProperties(lines) {
  const values = new Map();
  for (const line of lines) {
    const separator = line.indexOf(":");
    if (separator <= 0) continue;
    const left = line.slice(0, separator);
    const name = left.split(";", 1)[0].toUpperCase();
    if (!values.has(name)) values.set(name, []);
    values.get(name).push({ left, value: line.slice(separator + 1) });
  }
  return values;
}

function parseCalendarDate(property) {
  if (!property) return null;
  const value = property.value.trim();
  const date = /^(\d{4})(\d{2})(\d{2})$/.exec(value);
  if (date) {
    const [year, month, day] = date.slice(1).map(Number);
    const check = new Date(Date.UTC(year, month - 1, day));
    if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
    const dateValue = `${date[1]}-${date[2]}-${date[3]}`;
    return { value: dateValue, allDay: true, time: Date.parse(`${dateValue}T00:00:00+08:00`) };
  }
  const dateTime = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(value);
  if (!dateTime) return null;
  const [year, month, day, hour, minute, second] = dateTime.slice(1, 7).map(Number);
  const utc = Date.UTC(year, month - 1, day, hour, minute, second);
  const check = new Date(utc);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day
    || check.getUTCHours() !== hour || check.getUTCMinutes() !== minute || check.getUTCSeconds() !== second) return null;
  const tzid = (/(?:^|;)TZID=([^;:]+)/i.exec(property.left)?.[1] || "").replace(/^"|"$/g, "") || null;
  if (!dateTime[7] && tzid && !["Asia/Singapore", "Singapore Standard Time"].includes(tzid)) return null;
  const time = dateTime[7] === "Z" ? utc : utc - 8 * 60 * 60 * 1000;
  if (!Number.isFinite(time)) return null;
  return { value: new Date(time).toISOString(), allDay: false, time };
}

function calendarKind(title, properties) {
  if (properties.has("DUE") || /\b(?:due|deadline|submit)\b|截止|提交/i.test(title)) return "deadline";
  return "event";
}

async function publicCalendarEvent(lines, nowMs) {
  const properties = calendarProperties(lines);
  const courseCode = courseCodeForCalendarEvent(properties) || "NTU";
  if (properties.has("RRULE") || properties.has("RDATE") || properties.has("EXDATE")) return { event: null, reason: "recurring" };
  const title = normalizeCalendarTitle(properties.get("SUMMARY")?.[0]?.value);
  const kind = calendarKind(title, properties);
  const start = parseCalendarDate(kind === "deadline"
    ? properties.get("DUE")?.[0] || properties.get("DTSTART")?.[0]
    : properties.get("DTSTART")?.[0] || properties.get("DUE")?.[0]);
  if (!start) return { event: null, reason: "invalid_date" };
  const end = parseCalendarDate(kind === "deadline"
    ? properties.get("DUE")?.[0] || properties.get("DTEND")?.[0]
    : properties.get("DTEND")?.[0] || properties.get("DUE")?.[0]);
  if (end && end.time < start.time) return { event: null, reason: "invalid_date" };
  if (start.time < nowMs - 30 * 24 * 60 * 60 * 1000 || start.time > nowMs + 370 * 24 * 60 * 60 * 1000) return { event: null, reason: "out_of_range" };
  const identity = `${courseCode}|${start.value}|${end?.value || ""}|${title}`;
  const digest = bytesToHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(identity))).slice(0, 20);
  return {
    reason: "kept",
    event: {
      id: `${courseCode.toLowerCase()}-${digest}`,
      courseCode,
      title,
      start: start.value,
      end: end?.value || null,
      allDay: start.allDay,
      kind,
    },
  };
}

export async function parseNtuLearnCalendar(text, nowMs = Date.now()) {
  if (typeof text !== "string" || text.length === 0 || text.length > MAX_ICAL_BYTES) throw new Error("invalid_calendar");
  const lines = unfoldCalendarLines(text);
  if (lines[0]?.trim() !== "BEGIN:VCALENDAR" || lines.at(-1)?.trim() !== "END:VCALENDAR" || !lines.some((line) => line.trim() === "VERSION:2.0")) throw new Error("invalid_calendar");
  const blocks = [];
  let current = null;
  for (const line of lines) {
    if (line.trim() === "BEGIN:VEVENT") {
      if (current || blocks.length >= MAX_ICAL_EVENTS) throw new Error("invalid_calendar");
      current = [];
    } else if (line.trim() === "END:VEVENT") {
      if (!current) throw new Error("invalid_calendar");
      blocks.push(current);
      current = null;
    } else if (current) current.push(line);
  }
  if (current) throw new Error("invalid_calendar");
  const parsed = await Promise.all(blocks.map((block) => publicCalendarEvent(block, nowMs)));
  const diagnostics = {
    totalEvents: blocks.length,
    kept: parsed.filter((item) => item.reason === "kept").length,
    recurring: parsed.filter((item) => item.reason === "recurring").length,
    invalidDate: parsed.filter((item) => item.reason === "invalid_date").length,
    outOfRange: parsed.filter((item) => item.reason === "out_of_range").length,
  };
  const ignoredRecurring = diagnostics.recurring;
  const unique = new Map();
  for (const item of parsed) if (item.event) unique.set(item.event.id, item.event);
  const events = [...unique.values()].sort((left, right) => Date.parse(left.start) - Date.parse(right.start)).slice(0, MAX_PUBLIC_EVENTS);
  return { events, totalEvents: blocks.length, ignoredRecurring, diagnostics };
}

async function readLimitedCalendar(response) {
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > MAX_ICAL_BYTES) throw new Error("calendar_too_large");
  if (!response.body) throw new Error("invalid_calendar");
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_ICAL_BYTES) {
      await reader.cancel();
      throw new Error("calendar_too_large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { throw new Error("invalid_calendar"); }
}

function publicCalendarStatus(status) {
  return {
    state: status.state,
    attemptedAt: status.attemptedAt,
    lastSuccessAt: status.lastSuccessAt,
    eventCount: status.eventCount,
    errorCode: status.errorCode,
  };
}

async function calendarResponse(bucket) {
  const [calendar, status] = await Promise.all([readCalendar(bucket), readCalendarStatus(bucket)]);
  return { ...calendar, status: publicCalendarStatus(status) };
}

function calendarErrorStatus(code) {
  if (["not_configured", "invalid_configuration", "upstream_unavailable", "calendar_too_large", "invalid_calendar", "no_matching_events", "timeout"].includes(code)) return code;
  return "upstream_unavailable";
}

async function refreshCalendar(request, env, fetchImpl, now) {
  const bucket = requireBucket(env);
  if (!bucket) return { status: 503, data: { error: "Calendar storage unavailable" } };
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return { status: 403, data: { error: "Cross-origin refresh is not allowed" } };
  if (Number(request.headers.get("content-length") || 0) > 0) return { status: 400, data: { error: "Refresh does not accept a request body" } };
  const currentMs = now();
  const previous = await readCalendarStatus(bucket);
  const lastSuccessMs = previous.lastSuccessAt ? Date.parse(previous.lastSuccessAt) : 0;
  const lastAttemptMs = previous.attemptedAt ? Date.parse(previous.attemptedAt) : 0;
  if (lastSuccessMs && currentMs - lastSuccessMs < CALENDAR_SUCCESS_COOLDOWN_MS) {
    return { status: 200, data: { ok: true, cached: true, calendar: await calendarResponse(bucket) } };
  }
  if (lastAttemptMs && currentMs - lastAttemptMs < CALENDAR_FAILURE_BACKOFF_MS) {
    const retryAfter = Math.ceil((CALENDAR_FAILURE_BACKOFF_MS - (currentMs - lastAttemptMs)) / 1000);
    return { status: 429, headers: { "Retry-After": String(retryAfter) }, data: { error: "Please wait before retrying" } };
  }
  const attemptedAt = new Date(currentMs).toISOString();
  const feedUrl = validateCalendarFeedUrl(env?.NTULEARN_ICAL_URL);
  if (!feedUrl) {
    const status = { state: "error", attemptedAt, lastSuccessAt: previous.lastSuccessAt, eventCount: previous.eventCount, errorCode: env?.NTULEARN_ICAL_URL ? "invalid_configuration" : "not_configured" };
    await writeCalendarStatus(bucket, status);
    return { status: 503, data: { error: "Calendar feed has not been configured" } };
  }
  await writeCalendarStatus(bucket, { state: "running", attemptedAt, lastSuccessAt: previous.lastSuccessAt, eventCount: previous.eventCount, errorCode: null });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  let diagnostics = null;
  try {
    const response = await fetchImpl(feedUrl.toString(), { method: "GET", headers: { Accept: "text/calendar" }, redirect: "manual", signal: controller.signal });
    if (response.status !== 200) throw new Error("upstream_unavailable");
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.toLowerCase().startsWith("text/calendar")) throw new Error("invalid_calendar");
    const text = await readLimitedCalendar(response);
    const parsed = await parseNtuLearnCalendar(text, currentMs);
    diagnostics = parsed.diagnostics;
    if (parsed.events.length === 0) throw new Error("no_matching_events");
    const snapshot = {
      version: 1,
      updatedAt: new Date(currentMs).toISOString(),
      timezone: "Asia/Singapore",
      source: "NTULearn shared calendar",
      ignoredRecurring: parsed.ignoredRecurring,
      events: parsed.events,
    };
    if (!isCalendarSnapshot(snapshot)) throw new Error("invalid_calendar");
    await bucket.put(CALENDAR_KEY, JSON.stringify(snapshot), {
      httpMetadata: { contentType: "application/json", cacheControl: "public, max-age=60" },
      customMetadata: { purpose: "course-atlas-calendar", version: String(snapshot.version) },
    });
    await writeCalendarStatus(bucket, { state: "success", attemptedAt, lastSuccessAt: snapshot.updatedAt, eventCount: snapshot.events.length, errorCode: null });
    return { status: 200, data: { ok: true, cached: false, calendar: await calendarResponse(bucket), totalEvents: parsed.totalEvents } };
  } catch (error) {
    const code = error?.name === "AbortError" ? "timeout" : calendarErrorStatus(error?.message);
    await writeCalendarStatus(bucket, { state: "error", attemptedAt, lastSuccessAt: previous.lastSuccessAt, eventCount: previous.eventCount, errorCode: code });
    return { status: code === "timeout" ? 504 : 502, data: { error: "Calendar refresh failed", code, diagnostics: code === "no_matching_events" ? diagnostics : undefined } };
  } finally {
    clearTimeout(timeout);
  }
}

function runCalendarRefresh(request, env, fetchImpl, now) {
  if (calendarRefreshInFlight) return calendarRefreshInFlight;
  const operation = refreshCalendar(request, env, fetchImpl, now);
  const tracked = operation.finally(() => {
    if (calendarRefreshInFlight === tracked) calendarRefreshInFlight = null;
  });
  calendarRefreshInFlight = tracked;
  return tracked;
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
      const schedule = await readSchedule(bucket, env);
      return schedule ? publicJson(schedule) : json({ error: "Schedule data is unavailable or invalid" }, 503);
    }
    if (url.pathname === "/api/study-cards" && request.method === "GET") {
      const cards = await readStudyCards(requireBucket(env));
      return cards ? publicJson(cards) : json({ error: "Study-card data is unavailable or invalid" }, 503);
    }
    if (url.pathname === "/api/study-cards" && request.method === "PUT") return updateStudyCards(request, env);
    if (url.pathname === "/api/calendar" && request.method === "GET") {
      const bucket = requireBucket(env);
      if (!bucket) return json({ error: "Calendar storage unavailable" }, 503);
      return json(await calendarResponse(bucket), 200, { "X-Content-Type-Options": "nosniff" });
    }
    if (url.pathname === "/api/calendar/refresh" && request.method === "POST") {
      const result = await runCalendarRefresh(request, env, fetch, Date.now);
      return json(result.data, result.status, { "X-Content-Type-Options": "nosniff", ...(result.headers || {}) });
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
