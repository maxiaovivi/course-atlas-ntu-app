import { copyFileSync, existsSync, mkdirSync } from "node:fs";

mkdirSync("dist/.openai", { recursive: true });

if (!existsSync("dist/server/index.js")) {
  throw new Error("vinext did not produce dist/server/index.js");
}

copyFileSync(".openai/hosting.json", "dist/.openai/hosting.json");

console.log("Sites artifact prepared: dist/server/index.js");
