import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import worker, { DEFAULT_SCHEDULE, parseNtuLearnCalendar } from "./index.js";

class MemoryBucket {
  objects = new Map();

  async get(key) {
    const value = this.objects.get(key);
    return value === undefined ? null : { text: async () => value };
  }

  async put(key, value) {
    this.objects.set(key, typeof value === "string" ? value : new TextDecoder().decode(value));
  }
}

test("an empty schedule bucket is initialized from fictional repository data", async () => {
  const bucket = new MemoryBucket();
  const source = JSON.parse(await readFile(new URL("../data/schedule.example.json", import.meta.url), "utf8"));
  assert.deepEqual(DEFAULT_SCHEDULE, source);

  const response = await worker.fetch(new Request("https://example.test/api/schedule"), { FILES: bucket });
  assert.equal(response.status, 200);
  const schedule = await response.json();
  assert.equal(schedule.courses.length, 2);
  assert.equal(schedule.exceptions.length, 1);
  assert.equal(schedule.agenda.length, 3);
  assert.equal(schedule.academicCalendar.length, 4);
  assert.equal(schedule.courseBriefs.length, 2);
  assert.notEqual(schedule.updatedAt, source.updatedAt);
  assert.ok(bucket.objects.has("app/schedule-v1.json"));
});

test("schedule is updated in storage and then served publicly", async () => {
  const bucket = new MemoryBucket();
  const body = await readFile(new URL("../data/schedule.example.json", import.meta.url));
  const env = { FILES: bucket, UPLOAD_TOKEN: "test-only-token" };
  const update = await worker.fetch(new Request("https://example.test/api/admin/schedule", {
    method: "PUT",
    headers: { "content-type": "application/json", "x-upload-token": "test-only-token" },
    body,
  }), env);
  assert.equal(update.status, 200);
  const result = await update.json();
  assert.equal(result.courses, 2);
  assert.equal(result.exceptions, 1);
  assert.equal(result.agenda, 3);
  assert.equal(result.academicCalendar, 4);
  assert.equal(result.courseBriefs, 2);

  const response = await worker.fetch(new Request("https://example.test/api/schedule"), env);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control"), /max-age=60/);
  const schedule = await response.json();
  assert.equal(schedule.courses[0].code, "EX1001");
  assert.equal(schedule.exceptions[0].replacesDate, "2030-08-18");
  assert.equal(schedule.agenda[0].title, "Fictional Quiz 1");
  assert.equal(schedule.academicCalendar[0].kind, "recess");
  assert.deepEqual(schedule.courseBriefs[0].next, ["Read fictional chapter 2", "Bring the fictional lab notes"]);
  assert.notEqual(schedule.updatedAt, "2030-08-01T00:00:00+08:00");
});

test("single or chunked schedule secrets take priority and do not require storage", async () => {
  const secretSchedule = structuredClone(DEFAULT_SCHEDULE);
  secretSchedule.source = "Fictional Sites secret fixture";
  secretSchedule.courses[0].location = "Secret Example Hall";
  const fallbackSchedule = structuredClone(DEFAULT_SCHEDULE);
  fallbackSchedule.source = "Fictional R2 fallback fixture";
  const bucket = new MemoryBucket();
  bucket.objects.set("app/schedule-v1.json", JSON.stringify(fallbackSchedule));
  const response = await worker.fetch(new Request("https://example.test/api/schedule"), {
    FILES: bucket,
    COURSE_ATLAS_DATA_JSON: JSON.stringify(secretSchedule),
  });
  assert.equal(response.status, 200);
  const schedule = await response.json();
  assert.equal(schedule.source, "Fictional Sites secret fixture");
  assert.equal(schedule.courses[0].location, "Secret Example Hall");
  assert.equal(schedule.agenda.length, 3);

  const withoutStorage = await worker.fetch(new Request("https://example.test/api/schedule"), {
    COURSE_ATLAS_DATA_JSON: JSON.stringify(secretSchedule),
  });
  assert.equal(withoutStorage.status, 200);

  const encoded = JSON.stringify(secretSchedule);
  const midpoint = Math.ceil(encoded.length / 2);
  const chunked = await worker.fetch(new Request("https://example.test/api/schedule"), {
    COURSE_ATLAS_DATA_JSON_1: encoded.slice(0, midpoint),
    COURSE_ATLAS_DATA_JSON_2: encoded.slice(midpoint),
  });
  assert.equal(chunked.status, 200);
  assert.equal((await chunked.json()).courses[0].location, "Secret Example Hall");
});

test("an invalid configured schedule secret fails closed instead of exposing fallback data", async () => {
  const bucket = new MemoryBucket();
  bucket.objects.set("app/schedule-v1.json", JSON.stringify(DEFAULT_SCHEDULE));
  const response = await worker.fetch(new Request("https://example.test/api/schedule"), {
    FILES: bucket,
    COURSE_ATLAS_DATA_JSON: JSON.stringify({ ...DEFAULT_SCHEDULE, agenda: [{ id: "invalid" }] }),
  });
  assert.equal(response.status, 503);

  const invalidTeachingWindow = structuredClone(DEFAULT_SCHEDULE);
  invalidTeachingWindow.teachingBreaks[0].start = "2030-02-31";
  const invalidDateResponse = await worker.fetch(new Request("https://example.test/api/schedule"), {
    FILES: bucket,
    COURSE_ATLAS_DATA_JSON: JSON.stringify(invalidTeachingWindow),
  });
  assert.equal(invalidDateResponse.status, 503);

  const invalidCalendarKind = structuredClone(DEFAULT_SCHEDULE);
  invalidCalendarKind.academicCalendar[0].kind = "teaching";
  const invalidCalendarKindResponse = await worker.fetch(new Request("https://example.test/api/schedule"), {
    FILES: bucket,
    COURSE_ATLAS_DATA_JSON: JSON.stringify(invalidCalendarKind),
  });
  assert.equal(invalidCalendarKindResponse.status, 503);

  const invalidCalendarRange = structuredClone(DEFAULT_SCHEDULE);
  invalidCalendarRange.academicCalendar[0].start = "2030-10-06";
  const invalidCalendarRangeResponse = await worker.fetch(new Request("https://example.test/api/schedule"), {
    FILES: bucket,
    COURSE_ATLAS_DATA_JSON: JSON.stringify(invalidCalendarRange),
  });
  assert.equal(invalidCalendarRangeResponse.status, 503);

  const duplicateCalendarIds = structuredClone(DEFAULT_SCHEDULE);
  duplicateCalendarIds.academicCalendar[1].id = duplicateCalendarIds.academicCalendar[0].id;
  const duplicateCalendarIdsResponse = await worker.fetch(new Request("https://example.test/api/schedule"), {
    FILES: bucket,
    COURSE_ATLAS_DATA_JSON: JSON.stringify(duplicateCalendarIds),
  });
  assert.equal(duplicateCalendarIdsResponse.status, 503);

  const calendarWithUnknownField = structuredClone(DEFAULT_SCHEDULE);
  calendarWithUnknownField.academicCalendar[0].detail = "Unexpected field";
  const calendarWithUnknownFieldResponse = await worker.fetch(new Request("https://example.test/api/schedule"), {
    FILES: bucket,
    COURSE_ATLAS_DATA_JSON: JSON.stringify(calendarWithUnknownField),
  });
  assert.equal(calendarWithUnknownFieldResponse.status, 503);

  const nonContiguousChunks = await worker.fetch(new Request("https://example.test/api/schedule"), {
    FILES: bucket,
    COURSE_ATLAS_DATA_JSON_2: JSON.stringify(DEFAULT_SCHEDULE),
  });
  assert.equal(nonContiguousChunks.status, 503);
});

test("academic-calendar data remains optional for older schedule payloads", async () => {
  const legacySchedule = structuredClone(DEFAULT_SCHEDULE);
  delete legacySchedule.academicCalendar;
  const response = await worker.fetch(new Request("https://example.test/api/schedule"), {
    COURSE_ATLAS_DATA_JSON: JSON.stringify(legacySchedule),
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).academicCalendar, undefined);
});

test("course-brief data is strict while remaining optional for older payloads", async () => {
  const legacySchedule = structuredClone(DEFAULT_SCHEDULE);
  delete legacySchedule.courseBriefs;
  const legacyResponse = await worker.fetch(new Request("https://example.test/api/schedule"), {
    COURSE_ATLAS_DATA_JSON: JSON.stringify(legacySchedule),
  });
  assert.equal(legacyResponse.status, 200);
  assert.equal((await legacyResponse.json()).courseBriefs, undefined);

  const invalidSchedules = [];

  const unknownCourse = structuredClone(DEFAULT_SCHEDULE);
  unknownCourse.courseBriefs[0].courseCode = "EX9999";
  invalidSchedules.push(unknownCourse);

  const duplicateCourse = structuredClone(DEFAULT_SCHEDULE);
  duplicateCourse.courseBriefs[1].courseCode = duplicateCourse.courseBriefs[0].courseCode;
  invalidSchedules.push(duplicateCourse);

  const tooManyItems = structuredClone(DEFAULT_SCHEDULE);
  tooManyItems.courseBriefs[0].next = ["One", "Two", "Three", "Four"];
  invalidSchedules.push(tooManyItems);

  const unknownField = structuredClone(DEFAULT_SCHEDULE);
  unknownField.courseBriefs[0].detail = "Unexpected field";
  invalidSchedules.push(unknownField);

  const emptyBrief = structuredClone(DEFAULT_SCHEDULE);
  emptyBrief.courseBriefs[0].previous = [];
  emptyBrief.courseBriefs[0].previousDate = null;
  emptyBrief.courseBriefs[0].next = [];
  emptyBrief.courseBriefs[0].nextDate = null;
  invalidSchedules.push(emptyBrief);

  const duplicateItem = structuredClone(DEFAULT_SCHEDULE);
  duplicateItem.courseBriefs[0].next = ["Same fictional task", "Same fictional task"];
  invalidSchedules.push(duplicateItem);

  const paddedItem = structuredClone(DEFAULT_SCHEDULE);
  paddedItem.courseBriefs[0].next = [" Fictional task with padding"];
  invalidSchedules.push(paddedItem);

  const multilineItem = structuredClone(DEFAULT_SCHEDULE);
  multilineItem.courseBriefs[0].next = ["Fictional task\nwith hidden layout"];
  invalidSchedules.push(multilineItem);

  const missingDate = structuredClone(DEFAULT_SCHEDULE);
  missingDate.courseBriefs[0].nextDate = null;
  invalidSchedules.push(missingDate);

  const invalidDate = structuredClone(DEFAULT_SCHEDULE);
  invalidDate.courseBriefs[0].previousDate = "2030-02-31";
  invalidSchedules.push(invalidDate);

  const invertedDates = structuredClone(DEFAULT_SCHEDULE);
  invertedDates.courseBriefs[0].previousDate = "2030-08-26";
  invalidSchedules.push(invertedDates);

  for (const schedule of invalidSchedules) {
    const response = await worker.fetch(new Request("https://example.test/api/schedule"), {
      COURSE_ATLAS_DATA_JSON: JSON.stringify(schedule),
    });
    assert.equal(response.status, 503);
  }
});

test("schedule update rejects missing credentials and invalid data", async () => {
  const bucket = new MemoryBucket();
  const env = { FILES: bucket, UPLOAD_TOKEN: "test-only-token" };
  const unauthorized = await worker.fetch(new Request("https://example.test/api/admin/schedule", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: "{}",
  }), env);
  assert.equal(unauthorized.status, 401);

  const invalid = await worker.fetch(new Request("https://example.test/api/admin/schedule", {
    method: "PUT",
    headers: { "content-type": "application/json", "x-upload-token": "test-only-token" },
    body: JSON.stringify({ version: 1, courses: [] }),
  }), env);
  assert.equal(invalid.status, 400);
  assert.equal(bucket.objects.size, 0);
});

test("study cards are owner-updated, publicly readable, and strictly validated", async () => {
  const bucket = new MemoryBucket();
  const fixture = JSON.parse(await readFile(new URL("../data/study-cards.example.json", import.meta.url), "utf8"));
  const env = { FILES: bucket, UPLOAD_OWNER_EMAIL: "owner@example.invalid" };

  const empty = await worker.fetch(new Request("https://example.test/api/study-cards"), env);
  assert.equal(empty.status, 200);
  assert.deepEqual(await empty.json(), { version: 1, updatedAt: null, cards: [] });

  const unauthorized = await worker.fetch(new Request("https://example.test/api/study-cards", {
    method: "PUT",
    headers: { "content-type": "application/json", origin: "https://example.test" },
    body: JSON.stringify(fixture),
  }), env);
  assert.equal(unauthorized.status, 401);

  const update = await worker.fetch(new Request("https://example.test/api/study-cards", {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      origin: "https://example.test",
      "oai-authenticated-user-email": "owner@example.invalid",
    },
    body: JSON.stringify(fixture),
  }), env);
  assert.equal(update.status, 200);
  assert.equal((await update.json()).cards, 2);

  const response = await worker.fetch(new Request("https://example.test/api/study-cards"), env);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control"), /max-age=60/);
  const payload = await response.json();
  assert.equal(payload.cards.length, 2);
  assert.equal(payload.cards[0].latex[0], "x_{k+1}=A x_k+B u_k");
  assert.notEqual(payload.updatedAt, fixture.updatedAt);

  const nonStringTimestamp = structuredClone(fixture);
  nonStringTimestamp.updatedAt = 0;
  const timestampRejected = await worker.fetch(new Request("https://example.test/api/study-cards", {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      origin: "https://example.test",
      "oai-authenticated-user-email": "owner@example.invalid",
    },
    body: JSON.stringify(nonStringTimestamp),
  }), env);
  assert.equal(timestampRejected.status, 400);

  const unsafe = structuredClone(fixture);
  unsafe.cards[0].latex = ["\\href{https://example.invalid}{x}"];
  const rejected = await worker.fetch(new Request("https://example.test/api/study-cards", {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      origin: "https://example.test",
      "oai-authenticated-user-email": "owner@example.invalid",
    },
    body: JSON.stringify(unsafe),
  }), env);
  assert.equal(rejected.status, 400);

  const crossOrigin = await worker.fetch(new Request("https://example.test/api/study-cards", {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      origin: "https://evil.example.invalid",
      "oai-authenticated-user-email": "owner@example.invalid",
    },
    body: JSON.stringify(fixture),
  }), env);
  assert.equal(crossOrigin.status, 403);
});

const TEST_FEED_ID = "a".repeat(32);
const TEST_FEED_URL = `https://ntulearn.ntu.edu.sg/webapps/calendar/calendarFeed/${TEST_FEED_ID}/learn.ics`;

const SAMPLE_ICS = `BEGIN:VCALENDAR\r
VERSION:2.0\r
PRODID:-//Course Atlas fictional fixture//EN\r
BEGIN:VEVENT\r
UID:fixture-001@example.invalid\r
DTSTART:20260812T100000Z\r
DTEND:20260812T110000Z\r
SUMMARY:Fictional EE6221 assignment\\, 1 due\r
DESCRIPTION:FICTIONAL_DESCRIPTION_NOT_EXPORTED\r
URL:https://event.example.invalid/not-exported\r
END:VEVENT\r
BEGIN:VEVENT\r
UID:fixture-002@example.invalid\r
DTSTART;TZID=Asia/Singapore:20260813T183000\r
DTEND;TZID=Asia/Singapore:20260813T193000\r
SUMMARY:Fictional quiz for Analytic & Ensemble Machine\r
 Learning\r
END:VEVENT\r
BEGIN:VEVENT\r
UID:fixture-003@example.invalid\r
DTSTART;VALUE=DATE:20260814\r
SUMMARY:Fictional EE6497 exam\r
END:VEVENT\r
BEGIN:VEVENT\r
UID:fixture-004@example.invalid\r
DTSTART:20260815T100000Z\r
SUMMARY:Fictional personal reminder\r
END:VEVENT\r
BEGIN:VEVENT\r
UID:fixture-recurring@example.invalid\r
DTSTART:20260816T100000Z\r
RRULE:FREQ=WEEKLY;COUNT=4\r
SUMMARY:Fictional EE6407 recurring lecture\r
END:VEVENT\r
END:VCALENDAR\r
`;

test("NTULearn calendar parsing keeps exact fictional summaries without private ICS fields", async () => {
  const parsed = await parseNtuLearnCalendar(SAMPLE_ICS, Date.parse("2026-08-11T00:00:00Z"));
  assert.equal(parsed.totalEvents, 5);
  assert.equal(parsed.ignoredRecurring, 1);
  assert.equal(parsed.events.length, 4);
  assert.deepEqual(parsed.events.map((event) => event.courseCode), ["EE6221", "EE6406", "EE6497", "NTU"]);
  assert.equal(parsed.events[0].title, "Fictional EE6221 assignment, 1 due");
  assert.equal(parsed.events[1].start, "2026-08-13T10:30:00.000Z");
  assert.equal(parsed.events[2].allDay, true);
  assert.equal(parsed.events[3].title, "Fictional personal reminder");
  const publicText = JSON.stringify(parsed.events);
  assert.doesNotMatch(publicText, /fixture-001|FICTIONAL_DESCRIPTION_NOT_EXPORTED|event\.example\.invalid|fixture-recurring/);
});

test("an unclassified NTULearn event keeps its exact fictional summary", async () => {
  const calendar = `BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nUID:fixture-single@example.invalid\nDTSTART:20260815T100000Z\nSUMMARY:Fictional reminder https://example.invalid passcode: fixture-only\nDESCRIPTION:FICTIONAL_DESCRIPTION_NOT_EXPORTED\nEND:VEVENT\nEND:VCALENDAR`;
  const parsed = await parseNtuLearnCalendar(calendar, Date.parse("2026-08-11T00:00:00Z"));
  assert.equal(parsed.events.length, 1);
  assert.equal(parsed.events[0].courseCode, "NTU");
  assert.equal(parsed.events[0].title, "Fictional reminder https://example.invalid passcode: fixture-only");
  assert.doesNotMatch(JSON.stringify(parsed.events), /fixture-single|FICTIONAL_DESCRIPTION_NOT_EXPORTED/);
});

test("NTULearn calendar parser rejects malformed input", async () => {
  await assert.rejects(() => parseNtuLearnCalendar("not a calendar"), /invalid_calendar/);
  await assert.rejects(() => parseNtuLearnCalendar("BEGIN:VCALENDAR\nVERSION:1.0\nEND:VCALENDAR"), /invalid_calendar/);
});

test("calendar parsing rejects invalid dates and unsupported timezones", async () => {
  const invalidDate = `BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nDTSTART:20260231T100000Z\nSUMMARY:Fictional EE6221 invalid date\nEND:VEVENT\nEND:VCALENDAR`;
  const unsupportedZone = `BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nDTSTART;TZID=America/New_York:20260815T100000\nSUMMARY:Fictional EE6221 unsupported timezone\nEND:VEVENT\nEND:VCALENDAR`;
  assert.equal((await parseNtuLearnCalendar(invalidDate, Date.parse("2026-08-11T00:00:00Z"))).events.length, 0);
  assert.equal((await parseNtuLearnCalendar(unsupportedZone, Date.parse("2026-08-11T00:00:00Z"))).events.length, 0);
});

test("calendar deadlines prefer DUE while ordinary exams remain events", async () => {
  const calendar = `BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nUID:fixture-due@example.invalid\nDTSTART;TZID=Asia/Singapore:20260815T090000\nDUE;TZID=Asia/Singapore:20260815T235900\nSUMMARY:Fictional EE6221 assignment due\nEND:VEVENT\nBEGIN:VEVENT\nUID:fixture-exam@example.invalid\nDTSTART;VALUE=DATE:20260816\nSUMMARY:Fictional EE6406 exam\nEND:VEVENT\nEND:VCALENDAR`;
  const parsed = await parseNtuLearnCalendar(calendar, Date.parse("2026-08-11T00:00:00Z"));
  assert.equal(parsed.events[0].kind, "deadline");
  assert.equal(parsed.events[0].start, "2026-08-15T15:59:00.000Z");
  assert.equal(parsed.events[1].kind, "event");
});

test("description text cannot classify an unrelated event as a course", async () => {
  const calendar = `BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nUID:fixture-unclassified@example.invalid\nDTSTART:20260815T100000Z\nSUMMARY:Fictional unclassified appointment\nDESCRIPTION:Fictional note mentioning EE6221\nEND:VEVENT\nBEGIN:VEVENT\nUID:fixture-known@example.invalid\nDTSTART:20260816T100000Z\nSUMMARY:Fictional EE6406 lecture\nEND:VEVENT\nEND:VCALENDAR`;
  const parsed = await parseNtuLearnCalendar(calendar, Date.parse("2026-08-11T00:00:00Z"));
  assert.deepEqual(parsed.events.map((event) => event.courseCode), ["NTU", "EE6406"]);
  assert.equal(parsed.events[0].title, "Fictional unclassified appointment");
  assert.doesNotMatch(JSON.stringify(parsed.events), /fixture-unclassified|Fictional note mentioning/);
});

test("Sites refresh stores the runtime snapshot and uses the success cooldown", async () => {
  const bucket = new MemoryBucket();
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(SAMPLE_ICS, { status: 200, headers: { "content-type": "text/calendar; charset=utf-8" } });
  };
  const env = {
    FILES: bucket,
    NTULEARN_ICAL_URL: TEST_FEED_URL,
  };
  try {
    const first = await worker.fetch(new Request("https://example.test/api/calendar/refresh", { method: "POST" }), env);
    assert.equal(first.status, 200);
    const firstBody = await first.json();
    assert.equal(firstBody.cached, false);
    assert.equal(firstBody.calendar.events.length, 4);
    assert.equal(calls, 1);

    const second = await worker.fetch(new Request("https://example.test/api/calendar/refresh", { method: "POST" }), env);
    assert.equal(second.status, 200);
    const secondBody = await second.json();
    assert.equal(secondBody.cached, true);
    assert.equal(calls, 1);

    const stored = bucket.objects.get("app/ntulearn-calendar-v1.json");
    assert.ok(stored);
    assert.match(stored, /Fictional personal reminder/);
    assert.doesNotMatch(stored, /fixture-001|FICTIONAL_DESCRIPTION_NOT_EXPORTED|event\.example\.invalid/);
    assert.equal(stored.includes(TEST_FEED_ID), false);
    const read = await worker.fetch(new Request("https://example.test/api/calendar"), env);
    assert.equal(read.status, 200);
    assert.equal((await read.json()).status.state, "success");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("concurrent calendar refreshes share one fetch and release the in-flight operation", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 10));
    return new Response(SAMPLE_ICS, { status: 200, headers: { "content-type": "text/calendar" } });
  };
  const feed = TEST_FEED_URL;
  try {
    const firstBucket = new MemoryBucket();
    const request = () => worker.fetch(new Request("https://example.test/api/calendar/refresh", { method: "POST" }), { FILES: firstBucket, NTULEARN_ICAL_URL: feed });
    const [first, coalesced] = await Promise.all([request(), request()]);
    assert.equal(first.status, 200);
    assert.equal(coalesced.status, 200);
    assert.equal(calls, 1);

    const secondBucket = new MemoryBucket();
    const later = await worker.fetch(new Request("https://example.test/api/calendar/refresh", { method: "POST" }), { FILES: secondBucket, NTULEARN_ICAL_URL: feed });
    assert.equal(later.status, 200);
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("calendar refresh rejects unsafe configuration and cross-origin callers before fetching", async () => {
  const bucket = new MemoryBucket();
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return new Response(SAMPLE_ICS); };
  try {
    const unsafe = await worker.fetch(new Request("https://example.test/api/calendar/refresh", { method: "POST" }), {
      FILES: bucket,
      NTULEARN_ICAL_URL: "http://127.0.0.1/private.ics",
    });
    assert.equal(unsafe.status, 503);
    assert.equal(calls, 0);

    bucket.objects.clear();
    const crossOrigin = await worker.fetch(new Request("https://example.test/api/calendar/refresh", {
      method: "POST",
      headers: { Origin: "https://evil.example" },
    }), {
      FILES: bucket,
      NTULEARN_ICAL_URL: TEST_FEED_URL,
    });
    assert.equal(crossOrigin.status, 403);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a failed refresh preserves the last successful calendar snapshot", async () => {
  const bucket = new MemoryBucket();
  const snapshot = { ...emptyCalendarFixture(), updatedAt: "2026-08-11T00:00:00.000Z" };
  bucket.objects.set("app/ntulearn-calendar-v1.json", JSON.stringify(snapshot));
  bucket.objects.set("app/ntulearn-calendar-status-v1.json", JSON.stringify({ state: "success", attemptedAt: "2026-08-11T00:00:00.000Z", lastSuccessAt: "2026-08-11T00:00:00.000Z", eventCount: 1, errorCode: null }));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("unavailable", { status: 503, headers: { "content-type": "text/plain" } });
  try {
    const response = await worker.fetch(new Request("https://example.test/api/calendar/refresh", {
      method: "POST",
    }), {
      FILES: bucket,
      NTULEARN_ICAL_URL: TEST_FEED_URL,
    });
    assert.equal(response.status, 502);
    assert.equal(bucket.objects.get("app/ntulearn-calendar-v1.json"), JSON.stringify(snapshot));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function emptyCalendarFixture() {
  return {
    version: 1,
    updatedAt: null,
    timezone: "Asia/Singapore",
    source: "NTULearn shared calendar",
    ignoredRecurring: 0,
    events: [{
      id: "fixture-event-0000000001",
      courseCode: "EE6221",
      title: "Fictional test event",
      start: "2026-08-12T10:00:00.000Z",
      end: null,
      allDay: false,
      kind: "event",
    }],
  };
}
