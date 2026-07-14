/**
 * Grok Build app icon loader for Electron (taskbar / window).
 * Prefer assets/icon.png / icon.ico / icon.svg (no machine-local session paths).
 */
const { nativeImage } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

/** Fallback mark — black tile + official Grok spiral (matches brand). */
const SVG_MARK = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <rect width="256" height="256" rx="48" fill="#0A0A0A"/>
  <g transform="translate(36 36) scale(7.6666667)" fill="#FFFFFF" fill-rule="evenodd">
    <path d="M9.27 15.29l7.978-5.897c.391-.29.95-.177 1.137.272.98 2.369.542 5.215-1.41 7.169-1.951 1.954-4.667 2.382-7.149 1.406l-2.711 1.257c3.889 2.661 8.611 2.003 11.562-.953 2.341-2.344 3.066-5.539 2.388-8.42l.006.007c-.983-4.232.242-5.924 2.75-9.383.06-.082.12-.164.179-.248l-3.301 3.305v-.01L9.267 15.292M7.623 16.723c-2.792-2.67-2.31-6.801.071-9.184 1.761-1.763 4.647-2.483 7.166-1.425l2.705-1.25a7.808 7.808 0 00-1.829-1A8.975 8.975 0 005.984 5.83c-2.533 2.536-3.33 6.436-1.962 9.764 1.022 2.487-.653 4.246-2.34 6.022-.599.63-1.199 1.259-1.682 1.925l7.62-6.815"/>
  </g>
</svg>`;

function svgToNativeImage(svg) {
  const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  return nativeImage.createFromDataURL(dataUrl);
}

function resolveIconPath() {
  // Prefer SVG brand mark (official Grok spiral) over older PNG/ICO caches.
  const candidates = [
    path.join(__dirname, "..", "assets", "icon.svg"),
    path.join(__dirname, "..", "public", "icon.svg"),
    path.join(__dirname, "..", "assets", "icon.ico"),
    path.join(__dirname, "..", "assets", "icon.png"),
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
  const root = path.join(__dirname, "..");
  const out = path.join(root, "assets", "icon.png");
  const publicOut = path.join(root, "public", "icon.png");
  try {
    const img = getAppIcon();
    if (!img || img.isEmpty()) return null;
    const resized = img.resize({ width: 256, height: 256 });
    const png = (resized.isEmpty() ? img : resized).toPNG();
    if (!png || !png.length) return null;
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, png);
    fs.mkdirSync(path.dirname(publicOut), { recursive: true });
    fs.writeFileSync(publicOut, png);
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
