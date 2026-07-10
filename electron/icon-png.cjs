/**
 * Grok Build app icon loader for Electron (taskbar / window).
 * Prefer assets/icon.png / icon.ico / icon.svg (no machine-local session paths).
 */
const { nativeImage } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

/** Fallback mark — teal tile + white orbital slash (matches brand). */
const SVG_MARK = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <rect width="256" height="256" rx="48" fill="#4A6B70"/>
  <g transform="translate(28 28) scale(0.78125)" fill="#FFFFFF">
    <path fill-rule="evenodd" d="M128 18c60.8 0 110 49.2 110 110s-49.2 110-110 110S18 188.8 18 128 67.2 18 128 18zm0 52c-32 0-58 26-58 58s26 58 58 58 58-26 58-58-26-58-58-58z"/>
    <path d="M20 224c-4.5-4.5-5-12-0.5-17L207 19.5C212 15 219.5 15.5 224 20c4.5 4.5 5 12 0.5 17L37 224.5C32 229 24.5 228.5 20 224z"/>
  </g>
</svg>`;

function svgToNativeImage(svg) {
  const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  return nativeImage.createFromDataURL(dataUrl);
}

function resolveIconPath() {
  const candidates = [
    path.join(__dirname, "..", "assets", "icon.ico"),
    path.join(__dirname, "..", "assets", "icon.png"),
    path.join(__dirname, "..", "assets", "icon.svg"),
    path.join(__dirname, "..", "public", "icon.svg"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/**
 * @returns {import("electron").NativeImage}
 */
function getAppIcon() {
  const p = resolveIconPath();
  if (p) {
    try {
      if (p.endsWith(".svg")) {
        const svg = fs.readFileSync(p, "utf8");
        const img = svgToNativeImage(svg);
        if (img && !img.isEmpty()) return img;
      } else {
        const img = nativeImage.createFromPath(p);
        if (img && !img.isEmpty()) return img;
      }
    } catch {
      /* fall through */
    }
  }
  return svgToNativeImage(SVG_MARK);
}

/**
 * Write assets/icon.png from native image (helps Windows taskbar + electron-builder).
 * @returns {string | null}
 */
function ensurePngOnDisk() {
  const out = path.join(__dirname, "..", "assets", "icon.png");
  try {
    const img = getAppIcon();
    if (!img || img.isEmpty()) return null;
    const resized = img.resize({ width: 256, height: 256 });
    const png = (resized.isEmpty() ? img : resized).toPNG();
    if (!png || !png.length) return null;
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, png);
    return out;
  } catch {
    return null;
  }
}

/**
 * Keep brand logo PNGs in public/ + assets/ in sync from repo assets only.
 * No machine-local session paths (those must never ship).
 * @returns {{ copied: string[], sizes: Record<string, number> }}
 */
function ensureBrandLogoPngs() {
  const root = path.join(__dirname, "..");
  const sourceDir = path.join(root, "assets");
  const names = ["logo-light.png", "logo-dark.png", "icon.png"];
  const dirs = [path.join(root, "public"), path.join(root, "assets")];
  /** @type {string[]} */
  const copied = [];
  /** @type {Record<string, number>} */
  const sizes = {};
  for (const name of names) {
    const src = path.join(sourceDir, name);
    if (!fs.existsSync(src)) continue;
    for (const dir of dirs) {
      fs.mkdirSync(dir, { recursive: true });
      const dest = path.join(dir, name);
      if (path.resolve(src) === path.resolve(dest)) {
        sizes[dest] = fs.statSync(dest).size;
        continue;
      }
      fs.copyFileSync(src, dest);
      const n = fs.statSync(dest).size;
      copied.push(dest);
      sizes[dest] = n;
    }
  }
  return { copied, sizes };
}

module.exports = { getAppIcon, ensurePngOnDisk, ensureBrandLogoPngs, resolveIconPath };
