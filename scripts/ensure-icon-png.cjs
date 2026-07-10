/**
 * Electron main entry used only to generate assets/icon.png.
 * Avoids `electron -e "..."` which breaks under Windows cmd/npm quoting
 * (Electron treats the expression as an app path).
 *
 * Usage: electron ./scripts/ensure-icon-png.cjs
 */
const path = require("node:path");
const fs = require("node:fs");
const { app } = require("electron");

// Prevent second-instance / default window noise.
app.commandLine.appendSwitch("disable-gpu");
app.disableHardwareAcceleration?.();

function fallbackCopyLogo() {
  const root = path.join(__dirname, "..");
  const out = path.join(root, "assets", "icon.png");
  const candidates = [
    path.join(root, "assets", "logo-dark.png"),
    path.join(root, "assets", "logo-light.png"),
    path.join(root, "public", "logo-dark.png"),
  ];
  for (const src of candidates) {
    if (fs.existsSync(src) && fs.statSync(src).size > 500) {
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.copyFileSync(src, out);
      console.log(`[icon] fallback copy ${src} -> ${out}`);
      return out;
    }
  }
  return null;
}

app
  .whenReady()
  .then(() => {
    let out = null;
    try {
      const { ensurePngOnDisk } = require("../electron/icon-png.cjs");
      out = ensurePngOnDisk();
    } catch (err) {
      console.warn("[icon] ensurePngOnDisk failed:", err?.message || err);
    }
    if (!out || !fs.existsSync(out)) {
      out = fallbackCopyLogo();
    }
    if (out && fs.existsSync(out)) {
      console.log(`[icon] ready: ${out} (${fs.statSync(out).size} bytes)`);
      app.exit(0);
      return;
    }
    console.error("[icon] failed to create assets/icon.png");
    app.exit(1);
  })
  .catch((err) => {
    console.error(err);
    app.exit(1);
  });
