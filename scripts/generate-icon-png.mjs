/**
 * Non-Electron fallback: ensure assets/icon.png exists for electron-builder.
 * Prefer existing PNG; else copy logo-dark.png.
 * Primary path for quality SVG->PNG: npm run icon:png (Electron nativeImage).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outPath = path.join(root, "assets", "icon.png");

if (fs.existsSync(outPath) && fs.statSync(outPath).size > 500) {
  console.log(`keep existing ${outPath} (${fs.statSync(outPath).size} bytes)`);
  process.exit(0);
}

const candidates = [
  path.join(root, "assets", "logo-dark.png"),
  path.join(root, "assets", "logo-light.png"),
  path.join(root, "public", "logo-dark.png"),
];

for (const src of candidates) {
  if (fs.existsSync(src) && fs.statSync(src).size > 500) {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.copyFileSync(src, outPath);
    console.log(`copied ${src} -> ${outPath}`);
    process.exit(0);
  }
}

console.error("No icon source found (assets/icon.png or logo-dark.png).");
process.exit(1);
