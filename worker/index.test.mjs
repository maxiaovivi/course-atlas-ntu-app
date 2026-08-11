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

test("an empty schedule bucket is initialized from the reviewed repository data", async () => {
  const bucket = new MemoryBucket();
  const source = JSON.parse(await readFile(new URL("../data/schedule.json", import.meta.url), "utf8"));
  assert.deepEqual(DEFAULT_SCHEDULE, source);

  const response = await worker.fetch(new Request("https://example.test/api/schedule"), { FILES: bucket });
  assert.equal(response.status, 200);
  const schedule = await response.json();
  assert.equal(schedule.courses.length, 4);
  assert.equal(schedule.exceptions.length, 1);
  assert.notEqual(schedule.updatedAt, source.updatedAt);
  assert.ok(bucket.objects.has("app/schedule-v1.json"));
});

test("schedule is updated in storage and then served publicly", async () => {
  const bucket = new MemoryBucket();
  const body = await readFile(new URL("../data/schedule.json", import.meta.url));
  const env = { FILES: bucket, UPLOAD_TOKEN: "test-only-token" };
  const update = await worker.fetch(new Request("https://example.test/api/admin/schedule", {
    method: "PUT",
    headers: { "content-type": "application/json", "x-upload-token": "test-only-token" },
    body,
  }), env);
  assert.equal(update.status, 200);
  const result = await update.json();
  assert.equal(result.courses, 4);
  assert.equal(result.exceptions, 1);

  const response = await worker.fetch(new Request("https://example.test/api/schedule"), env);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control"), /max-age=60/);
  const schedule = await response.json();
  assert.equal(schedule.courses[0].code, "EE6497");
  assert.equal(schedule.exceptions[0].replacesDate, "2026-08-10");
  assert.notEqual(schedule.updatedAt, "2026-08-11T00:00:00+08:00");
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

const SAMPLE_ICS = `BEGIN:VCALENDAR\r
VERSION:2.0\r
PRODID:-//Course Atlas test//EN\r
BEGIN:VEVENT\r
UID:private-student@example.test\r
DTSTART:20260812T100000Z\r
DTEND:20260812T110000Z\r
SUMMARY:EE6221 Assignment\\, 1 due\r
DESCRIPTION:Secret description with https://meet.example.test and passcode: 123456\r
END:VEVENT\r
BEGIN:VEVENT\r
UID:folded@example.test\r
DTSTART;TZID=Asia/Singapore:20260813T183000\r
DTEND;TZID=Asia/Singapore:20260813T193000\r
SUMMARY:Quiz 1 for Analytic & Ensemble Machine\r
 Learning\r
END:VEVENT\r
BEGIN:VEVENT\r
UID:all-day@example.test\r
DTSTART;VALUE=DATE:20260814\r
SUMMARY:EE6497 exam\r
END:VEVENT\r
BEGIN:VEVENT\r
UID:other@example.test\r
DTSTART:20260815T100000Z\r
SUMMARY:Unrelated personal calendar event\r
END:VEVENT\r
BEGIN:VEVENT\r
UID:recurring@example.test\r
DTSTART:20260816T100000Z\r
RRULE:FREQ=WEEKLY;COUNT=4\r
SUMMARY:EE6407 recurring lecture\r
END:VEVENT\r
END:VCALENDAR\r
`;

test("NTULearn calendar parsing keeps only safe allowlisted events", async () => {
  const parsed = await parseNtuLearnCalendar(SAMPLE_ICS, Date.parse("2026-08-11T00:00:00Z"));
  assert.equal(parsed.totalEvents, 5);
  assert.equal(parsed.ignoredRecurring, 1);
  assert.equal(parsed.events.length, 3);
  assert.deepEqual(parsed.events.map((event) => event.courseCode), ["EE6221", "EE6406", "EE6497"]);
  assert.equal(parsed.events[0].title, "EE6221 Assignment, 1 due");
  assert.equal(parsed.events[1].start, "2026-08-13T10:30:00.000Z");
  assert.equal(parsed.events[2].allDay, true);
  const publicText = JSON.stringify(parsed.events);
  assert.doesNotMatch(publicText, /private-student|Secret description|meet\.example|123456|recurring@example/);
});

test("NTULearn calendar parser rejects malformed input", async () => {
  await assert.rejects(() => parseNtuLearnCalendar("not a calendar"), /invalid_calendar/);
  await assert.rejects(() => parseNtuLearnCalendar("BEGIN:VCALENDAR\nVERSION:1.0\nEND:VCALENDAR"), /invalid_calendar/);
});

test("NTULearn calendar parser recognizes the verified internal course id", async () => {
  const calendar = `BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nUID:opaque\nDTSTART:20260812T100000Z\nSUMMARY:Make-up lecture\nURL:https://ntulearn.ntu.edu.sg/ultra/courses/_2706629_1/outline\nEND:VEVENT\nEND:VCALENDAR`;
  const parsed = await parseNtuLearnCalendar(calendar, Date.parse("2026-08-11T00:00:00Z"));
  assert.equal(parsed.events.length, 1);
  assert.equal(parsed.events[0].courseCode, "EE6497");
  assert.doesNotMatch(JSON.stringify(parsed.events), /2706629|\/outline/);
});

test("Sites refresh stores a safe snapshot and uses the success cooldown", async () => {
  const bucket = new MemoryBucket();
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(SAMPLE_ICS, { status: 200, headers: { "content-type": "text/calendar; charset=utf-8" } });
  };
  const env = {
    FILES: bucket,
    NTULEARN_ICAL_URL: "https://ntulearn.ntu.edu.sg/webapps/calendar/calendarFeed/0123456789abcdef0123456789abcdef/learn.ics",
  };
  try {
    const first = await worker.fetch(new Request("https://example.test/api/calendar/refresh", { method: "POST" }), env);
    assert.equal(first.status, 200);
    const firstBody = await first.json();
    assert.equal(firstBody.cached, false);
    assert.equal(firstBody.calendar.events.length, 3);
    assert.equal(calls, 1);

    const second = await worker.fetch(new Request("https://example.test/api/calendar/refresh", { method: "POST" }), env);
    assert.equal(second.status, 200);
    const secondBody = await second.json();
    assert.equal(secondBody.cached, true);
    assert.equal(calls, 1);

    const stored = bucket.objects.get("app/ntulearn-calendar-v1.json");
    assert.ok(stored);
    assert.doesNotMatch(stored, /0123456789abcdef|private-student|Secret description|meet\.example|123456/);
    const read = await worker.fetch(new Request("https://example.test/api/calendar"), env);
    assert.equal(read.status, 200);
    assert.equal((await read.json()).status.state, "success");
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
      NTULEARN_ICAL_URL: "https://ntulearn.ntu.edu.sg/webapps/calendar/calendarFeed/0123456789abcdef0123456789abcdef/learn.ics",
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
    const response = await worker.fetch(new Request("https://example.test/api/calendar/refresh", { method: "POST" }), {
      FILES: bucket,
      NTULEARN_ICAL_URL: "https://ntulearn.ntu.edu.sg/webapps/calendar/calendarFeed/0123456789abcdef0123456789abcdef/learn.ics",
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
      id: "ee6221-0123456789abcdef0123",
      courseCode: "EE6221",
      title: "Test event",
      start: "2026-08-12T10:00:00.000Z",
      end: null,
      allDay: false,
      kind: "event",
    }],
  };
}
