import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Mirror brand assets from assets/ → public/ (repo-local only).
 * Does NOT read machine-local Grok session paths.
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = path.join(root, "assets");
const destDir = path.join(root, "public");
const names = ["logo-light.png", "logo-dark.png", "icon.svg", "icon.png"];

fs.mkdirSync(destDir, { recursive: true });
for (const name of names) {
  const src = path.join(sourceDir, name);
  if (!fs.existsSync(src)) {
    console.warn(`skip (missing): ${src}`);
    continue;
  }
  const dest = path.join(destDir, name);
  fs.copyFileSync(src, dest);
  console.log(`${dest} (${fs.statSync(dest).size} bytes)`);
}
