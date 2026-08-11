import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import worker from "./index.js";

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
