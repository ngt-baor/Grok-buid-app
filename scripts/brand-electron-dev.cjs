/**
 * Brand the stock Electron binary used by `npm run dev` / `electron .`.
 *
 * Without this, macOS Dock / Cmd+Tab / menu bar often show "Electron" + default
 * icon because the process is node_modules/electron/dist/Electron.app.
 *
 * Packaged builds (.app / DMG) already use productName + assets/icon.icns via
 * electron-builder — this script only affects the dev binary.
 *
 * Safe to re-run. Re-apply after `npm install` (Electron re-extracts).
 */
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const DISPLAY_NAME =
  process.env.GROK_APP_DISPLAY_NAME ||
  readProductName() ||
  "Grok Build App";

function readProductName() {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(ROOT, "package.json"), "utf8")
    );
    return (
      pkg.productName ||
      pkg.build?.productName ||
      null
    );
  } catch {
    return null;
  }
}

function replacePlistString(xml, key, value) {
  // <key>KEY</key>\n\t<string>...</string>
  const re = new RegExp(
    `(<key>${key}<\\/key>\\s*<string>)([^<]*)(<\\/string>)`
  );
  const m = xml.match(re);
  if (!m) return { xml, changed: false };
  if (m[2] === value) return { xml, changed: false };
  const next = xml.replace(re, `$1${value}$3`);
  return { xml: next, changed: next !== xml };
}

function brandMacElectronApp() {
  const appRoot = path.join(
    ROOT,
    "node_modules",
    "electron",
    "dist",
    "Electron.app"
  );
  const plistPath = path.join(appRoot, "Contents", "Info.plist");
  const resourcesDir = path.join(appRoot, "Contents", "Resources");
  const destIcns = path.join(resourcesDir, "electron.icns");
  const srcIcns = path.join(ROOT, "assets", "icon.icns");

  if (!fs.existsSync(plistPath)) {
    return { ok: false, reason: "Electron.app Info.plist missing (run npm install)" };
  }

  let xml = fs.readFileSync(plistPath, "utf8");
  let changed = false;
  for (const key of ["CFBundleDisplayName", "CFBundleName"]) {
    const r = replacePlistString(xml, key, DISPLAY_NAME);
    xml = r.xml;
    changed = changed || r.changed;
  }
  if (changed) {
    fs.writeFileSync(plistPath, xml, "utf8");
  }

  let iconCopied = false;
  if (fs.existsSync(srcIcns) && fs.existsSync(resourcesDir)) {
    try {
      const srcStat = fs.statSync(srcIcns);
      let needCopy = true;
      if (fs.existsSync(destIcns)) {
        const destStat = fs.statSync(destIcns);
        // Skip if already same size (cheap idempotency; content may differ after electron upgrade)
        if (destStat.size === srcStat.size && destStat.mtimeMs >= srcStat.mtimeMs) {
          needCopy = false;
        }
      }
      if (needCopy) {
        fs.copyFileSync(srcIcns, destIcns);
        iconCopied = true;
      }
    } catch (e) {
      return {
        ok: true,
        changed,
        iconCopied: false,
        warn: `icns copy failed: ${e?.message || e}`,
      };
    }
  } else if (!fs.existsSync(srcIcns)) {
    return {
      ok: true,
      changed,
      iconCopied: false,
      warn: "assets/icon.icns missing — Dock icon may stay default Electron",
    };
  }

  return { ok: true, changed, iconCopied, name: DISPLAY_NAME };
}

function brandWinElectron() {
  // Process name in Task Manager stays Electron.exe unless the binary is renamed
  // (fragile). Icon can be set at runtime via BrowserWindow / setIcon — already done.
  // No file patch here without rcedit.
  return { ok: true, skipped: true, reason: "Windows uses runtime setIcon; no binary patch" };
}

function main() {
  if (process.platform === "darwin") {
    const r = brandMacElectronApp();
    if (!r.ok) {
      console.warn(`[brand-electron-dev] ${r.reason}`);
      process.exitCode = 0; // do not fail install/dev
      return;
    }
    const parts = [`name="${r.name}"`];
    if (r.changed) parts.push("Info.plist updated");
    else parts.push("Info.plist already branded");
    if (r.iconCopied) parts.push("electron.icns replaced");
    else if (!r.warn) parts.push("electron.icns up to date");
    console.log(`[brand-electron-dev] macOS: ${parts.join("; ")}`);
    if (r.warn) console.warn(`[brand-electron-dev] ${r.warn}`);
    return;
  }
  if (process.platform === "win32") {
    const r = brandWinElectron();
    console.log(`[brand-electron-dev] ${r.reason}`);
    return;
  }
  console.log(`[brand-electron-dev] skip on ${process.platform}`);
}

main();
