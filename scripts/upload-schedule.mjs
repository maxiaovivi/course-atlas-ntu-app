import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const SITE_URL = (process.env.SITE_URL || "https://fatemeeting.site").replace(/\/$/, "");
const UPLOAD_TOKEN = process.env.UPLOAD_TOKEN;
const SITES_BYPASS_TOKEN = process.env.SITES_BYPASS_TOKEN;
const schedulePath = resolve(process.argv[2] || "data/schedule.json");

if (!UPLOAD_TOKEN) throw new Error("UPLOAD_TOKEN is required");

const bytes = await readFile(schedulePath);
const parsed = JSON.parse(bytes.toString("utf8"));
if (parsed.version !== 1 || !Array.isArray(parsed.courses) || !Array.isArray(parsed.exceptions)) {
  throw new Error("Schedule JSON does not match version 1");
}

const headers = {
  "content-type": "application/json",
  "content-length": String(bytes.byteLength),
  "x-upload-token": UPLOAD_TOKEN,
};
if (SITES_BYPASS_TOKEN) headers["OAI-Sites-Authorization"] = `Bearer ${SITES_BYPASS_TOKEN}`;

const response = await fetch(`${SITE_URL}/api/admin/schedule`, {
  method: "PUT",
  headers,
  body: bytes,
});
if (!response.ok) throw new Error(`Schedule update failed: ${response.status} ${await response.text()}`);
const result = await response.json();
console.log(`Schedule updated: ${result.courses} courses, ${result.exceptions} exceptions, ${result.updatedAt}`);
