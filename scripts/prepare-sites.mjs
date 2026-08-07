import { copyFileSync, existsSync, mkdirSync } from "node:fs";

mkdirSync("dist/.openai", { recursive: true });

if (!existsSync("dist/server/prerendered-routes/index.html")) {
  throw new Error("vinext did not prerender the home page");
}

copyFileSync("worker/index.js", "dist/server/index.js");
copyFileSync("node_modules/pdfjs-dist/build/pdf.worker.min.mjs", "dist/client/pdf.worker.min.mjs");
copyFileSync("dist/server/prerendered-routes/index.html", "dist/client/index.html");
copyFileSync("dist/server/prerendered-routes/404.html", "dist/client/404.html");
copyFileSync("dist/server/prerendered-routes/index.rsc", "dist/client/index.rsc");
copyFileSync(".openai/hosting.json", "dist/.openai/hosting.json");

console.log("Sites static worker prepared: dist/server/index.js");
