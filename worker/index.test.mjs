import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import worker, { DEFAULT_SCHEDULE } from "./index.js";

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

test("NTULearn snapshots accept sanitized metadata and reject non-NTU URLs", async () => {
  const bucket = new MemoryBucket();
  const env = { FILES: bucket, NTULEARN_UPLOAD_TOKEN: "test-only-token", UPLOAD_OWNER_EMAIL: "owner@example.test" };
  const snapshot = {
    version: 1,
    collectedAt: "2026-08-11T08:00:00.000Z",
    courses: [{ id: "course-id", code: "EE6221", name: "Robotics & Intelligent Sensors" }],
    items: [{
      id: "announcement-id",
      courseCode: "EE6221",
      type: "announcement",
      title: "Week 1 update",
      url: "https://ntulearn.ntu.edu.sg/ultra/courses/course-id/announcements",
      publishedAt: "2026-08-11T07:30:00.000Z",
      updatedAt: null,
      dueAt: null,
    }],
  };
  const update = await worker.fetch(new Request("https://example.test/api/admin/ntulearn", {
    method: "PUT",
    headers: { "content-type": "application/json", "x-upload-token": "test-only-token" },
    body: JSON.stringify(snapshot),
  }), env);
  assert.equal(update.status, 200);

  const publicRead = await worker.fetch(new Request("https://example.test/api/ntulearn"), env);
  assert.deepEqual(await publicRead.json(), { version: 1, collectedAt: snapshot.collectedAt, courseCount: 1, itemCount: 1 });
  const read = await worker.fetch(new Request("https://example.test/api/ntulearn", {
    headers: { "oai-authenticated-user-email": "owner@example.test" },
  }), env);
  assert.deepEqual(await read.json(), snapshot);

  snapshot.items[0].url = "https://example.com/private";
  const rejected = await worker.fetch(new Request("https://example.test/api/admin/ntulearn", {
    method: "PUT",
    headers: { "content-type": "application/json", "x-upload-token": "test-only-token" },
    body: JSON.stringify(snapshot),
  }), env);
  assert.equal(rejected.status, 400);
});

test("NTULearn refresh waits for one private collector run and enforces cooldown", async () => {
  const bucket = new MemoryBucket();
  const idle = await worker.fetch(new Request("https://example.test/api/ntulearn/status"), { FILES: bucket });
  assert.equal((await idle.json()).message, null);
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url, authorization: init.headers.Authorization });
    return Response.json({ status: { state: "success", message: "done", updatedAt: "2026-08-11T08:01:00.000Z" } });
  };
  try {
    const env = { FILES: bucket, NTULEARN_COLLECTOR_URL: "https://collector.example", NTULEARN_COLLECTOR_TOKEN: "collector-token" };
    const first = await worker.fetch(new Request("https://example.test/api/ntulearn/refresh", { method: "POST" }), env);
    assert.equal(first.status, 200);
    assert.deepEqual(calls, [{ url: "https://collector.example/refresh", authorization: "Bearer collector-token" }]);
    assert.equal((await first.json()).status.state, "success");

    const second = await worker.fetch(new Request("https://example.test/api/ntulearn/refresh", { method: "POST" }), env);
    assert.equal(second.status, 429);
    assert.equal(calls.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
