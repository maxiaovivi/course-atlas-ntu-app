import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { basename, join, relative, sep } from "node:path";

const VAULT_ROOT = process.env.VAULT_ROOT || "/vault";
const SITE_URL = process.env.SITE_URL;
const UPLOAD_TOKEN = process.env.UPLOAD_TOKEN;
const SITES_BYPASS_TOKEN = process.env.SITES_BYPASS_TOKEN;
const COURSE_ROOT = join(VAULT_ROOT, "01-Studies/CCA/03-Course-Notes");
const COURSES = ["EE6221", "EE6406", "EE6407", "EE6497"];
const INCLUDED_ROOTS = ["Current", "Historical", "Quiz", "Exams"];
const EXCLUDED_SEGMENTS = new Set(["Student-Solutions", "Sources", "External-GitHub", ".private", "Email-Imports"]);

if (!SITE_URL || !UPLOAD_TOKEN || !SITES_BYPASS_TOKEN) {
  throw new Error("SITE_URL, UPLOAD_TOKEN, and SITES_BYPASS_TOKEN are required");
}

async function walk(directory) {
  const output = [];
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); } catch { return output; }
  for (const entry of entries) {
    if (EXCLUDED_SEGMENTS.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await walk(path));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(".pdf")) output.push(path);
  }
  return output;
}

function shelfFor(source) {
  const normalized = source.split(sep).join("/");
  if (normalized.includes("/Exams/")) return "Exams";
  if (normalized.includes("/Quiz/")) return "Quiz";
  if (normalized.includes("/Historical/Assignments/")) return "Assignments";
  if (normalized.includes("/Historical/Study-Aids/")) return "Study aids";
  return "Lectures";
}

function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

const candidates = [];
for (const course of COURSES) {
  for (const root of INCLUDED_ROOTS) candidates.push(...await walk(join(COURSE_ROOT, course, root)));
}

const seenHashes = new Set();
const materials = [];
for (const path of candidates.sort()) {
  const bytes = await readFile(path);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (seenHashes.has(sha256)) continue;
  seenHashes.add(sha256);
  const source = relative(VAULT_ROOT, path).split(sep).join("/");
  if (/\.private|email-imports|student-solutions|external-github|\/sources\//i.test(source)) continue;
  const course = COURSES.find((code) => source.includes(`/${code}/`));
  if (!course) continue;
  const shelf = shelfFor(source);
  materials.push({ path, bytes, source, course, shelf, sha256, id: `${course.toLowerCase()}-${slug(shelf)}-${sha256.slice(0, 16)}` });
}

console.log(`Prepared ${materials.length} deduplicated PDFs from the protected vault.`);
let uploaded = 0;
for (const material of materials) {
  const title = basename(material.path);
  const query = new URLSearchParams({
    course: material.course,
    shelf: material.shelf,
    id: material.id,
    title,
    source: material.source,
    sha256: material.sha256,
  });
  const response = await fetch(`${SITE_URL}/api/admin/materials?${query}`, {
    method: "POST",
    headers: {
      "content-type": "application/pdf",
      "content-length": String(material.bytes.byteLength),
      "x-upload-token": UPLOAD_TOKEN,
      "OAI-Sites-Authorization": `Bearer ${SITES_BYPASS_TOKEN}`,
    },
    body: material.bytes,
  });
  if (!response.ok) throw new Error(`${material.course}/${title}: ${response.status} ${await response.text()}`);
  uploaded += 1;
  console.log(`[${uploaded}/${materials.length}] ${material.course} · ${material.shelf} · ${title}`);
}

const size = materials.reduce((sum, item) => sum + item.bytes.byteLength, 0);
console.log(`Uploaded ${uploaded} PDFs (${(size / 1024 / 1024).toFixed(1)} MiB).`);
