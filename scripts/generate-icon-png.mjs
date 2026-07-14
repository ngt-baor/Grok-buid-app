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
const svgPath = path.join(root, "assets", "icon.svg");
const publicSvg = path.join(root, "public", "icon.svg");

// Prefer regenerating when SVG brand mark is newer than PNG (avoids stale Ø-style icon).
const svgSrc = [svgPath, publicSvg].find((p) => fs.existsSync(p));
if (
  svgSrc &&
  fs.existsSync(outPath) &&
  fs.statSync(outPath).size > 500 &&
  fs.statSync(outPath).mtimeMs >= fs.statSync(svgSrc).mtimeMs
) {
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
