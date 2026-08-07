const DEMO_KEY = "demo/course-atlas-reader.pdf";

function buildDemoPdf() {
  const pageContent = (page) => `q
0.02 0.14 0.20 rg 0 0 595 842 re f
0.29 0.79 0.91 RG 2 w 46 742 m 549 742 l S
BT /F1 11 Tf 0.42 0.85 0.94 rg 46 770 Td (EE6221  /  COURSE ATLAS) Tj ET
BT /F1 42 Tf 0.92 0.98 1 rg 46 650 Td (Robotics & Intelligent Sensors) Tj ET
BT /F1 15 Tf 0.53 0.72 0.80 rg 46 614 Td (A live PDF delivered from Sites object storage.) Tj ET
0.05 0.29 0.40 rg 46 244 503 300 re f
0.29 0.79 0.91 RG 1 w 46 244 503 300 re S
0.10 0.50 0.66 rg 248 338 100 100 re f
BT /F1 50 Tf 0.92 0.98 1 rg 283 370 Td (${page}) Tj ET
BT /F1 13 Tf 0.58 0.77 0.84 rg 46 196 Td (Range requests  /  visible-page rendering  /  private-by-default) Tj ET
BT /F1 10 Tf 0.42 0.63 0.71 rg 46 58 Td (Generated only for the storage integration test. No course files uploaded.) Tj ET
Q`;

  const streams = [1, 2, 3].map(pageContent);
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R 5 0 R 7 0 R] /Count 3 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 9 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${streams[0].length} >>\nstream\n${streams[0]}\nendstream`,
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 9 0 R >> >> /Contents 6 0 R >>",
    `<< /Length ${streams[1].length} >>\nstream\n${streams[1]}\nendstream`,
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 9 0 R >> >> /Contents 8 0 R >>",
    `<< /Length ${streams[2].length} >>\nstream\n${streams[2]}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];

  let pdf = "%PDF-1.7\n% Course Atlas storage test\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}

function parseRange(value, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value || "");
  if (!match) return null;
  const start = match[1] ? Number(match[1]) : 0;
  const end = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) return null;
  return { start, end: Math.min(end, size - 1) };
}

async function ensureDemoObject(bucket) {
  let object = await bucket.head(DEMO_KEY);
  if (!object) {
    const bytes = buildDemoPdf();
    await bucket.put(DEMO_KEY, bytes, {
      httpMetadata: { contentType: "application/pdf", cacheControl: "private, max-age=3600" },
      customMetadata: { purpose: "course-atlas-storage-test" },
    });
    object = await bucket.head(DEMO_KEY);
  }
  return object;
}

function pdfHeaders(size, etag, mode) {
  const headers = new Headers({
    "Content-Type": "application/pdf",
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
    "X-Course-Atlas-Storage": mode,
  });
  if (size != null) headers.set("Content-Length", String(size));
  if (etag) headers.set("ETag", etag);
  return headers;
}

async function serveDemoPdf(request, env) {
  const bucket = env?.FILES;
  if (!bucket || typeof bucket.get !== "function") {
    const bytes = buildDemoPdf();
    const range = parseRange(request.headers.get("Range"), bytes.byteLength);
    if (range) {
      const body = bytes.slice(range.start, range.end + 1);
      const headers = pdfHeaders(body.byteLength, null, "worker-fallback");
      headers.set("Content-Range", `bytes ${range.start}-${range.end}/${bytes.byteLength}`);
      return new Response(request.method === "HEAD" ? null : body, { status: 206, headers });
    }
    return new Response(request.method === "HEAD" ? null : bytes, { headers: pdfHeaders(bytes.byteLength, null, "worker-fallback") });
  }

  const metadata = await ensureDemoObject(bucket);
  const range = parseRange(request.headers.get("Range"), metadata.size);
  const object = await bucket.get(DEMO_KEY, range ? { range: { offset: range.start, length: range.end - range.start + 1 } } : undefined);
  if (!object) return new Response("PDF not found", { status: 404 });

  const headers = pdfHeaders(range ? range.end - range.start + 1 : metadata.size, metadata.httpEtag, "r2");
  if (range) headers.set("Content-Range", `bytes ${range.start}-${range.end}/${metadata.size}`);
  return new Response(request.method === "HEAD" ? null : object.body, { status: range ? 206 : 200, headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/storage/status") {
      const available = Boolean(env?.FILES && typeof env.FILES.get === "function");
      return Response.json({ available, binding: available ? "FILES" : null, demoKey: DEMO_KEY }, {
        headers: { "Cache-Control": "no-store" },
      });
    }

    if (url.pathname === "/api/demo.pdf" && (request.method === "GET" || request.method === "HEAD")) {
      return serveDemoPdf(request, env);
    }

    if (!env?.ASSETS || typeof env.ASSETS.fetch !== "function") {
      return new Response("Static asset binding unavailable", { status: 503 });
    }

    if (url.pathname === "/") url.pathname = "/index.html";
    let response = await env.ASSETS.fetch(new Request(url, request));

    if (response.status === 404 && request.method === "GET" && !url.pathname.startsWith("/_next/") && !url.pathname.startsWith("/api/")) {
      url.pathname = "/index.html";
      response = await env.ASSETS.fetch(new Request(url, request));
    }
    return response;
  },
};
