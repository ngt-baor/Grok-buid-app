/**
 * Lightweight macOS / cross-platform smoke checks (no Electron window).
 * Run: node scripts/macos-platform-smoke.cjs
 */
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert");

const root = path.join(__dirname, "..");
process.chdir(root);

let failed = 0;
function ok(name, cond, detail = "") {
  if (cond) {
    console.log(`  OK  ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    failed += 1;
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

console.log(`macos-platform-smoke  platform=${process.platform} arch=${process.arch}`);
console.log("");

// Paths module
const paths = require("../electron/platform/paths.cjs");
ok("platformTriple non-null on win/mac/linux", paths.platformTriple() != null || !["win32","darwin","linux"].includes(process.platform), paths.platformTriple());
ok("defaultGrokPath is absolute", path.isAbsolute(paths.defaultGrokPath()), paths.defaultGrokPath());
if (process.platform === "darwin") {
  ok("mac default binary is grok (not .exe)", paths.defaultGrokBinaryName() === "grok");
  ok("mac triple starts with macos-", String(paths.platformTriple() || "").startsWith("macos-"));
}
if (process.platform === "win32") {
  ok("win default binary is grok.exe", paths.defaultGrokBinaryName() === "grok.exe");
}

const cli = require("../electron/cli-install.cjs");
const status = cli.getCliStatus();
ok("getCliStatus.ok", status.ok === true);
ok("getCliStatus.supported", status.supported === true, status.platform);
console.log(`  info CLI installed=${status.installed} path=${status.path || "(none)"}`);

// Terminal options
const term = require("../electron/platform/terminal.cjs");
const opts = term.terminalOptions();
ok("terminalOptions non-empty", Array.isArray(opts) && opts.length > 0, JSON.stringify(opts.map((o) => o.id)));

// Updater asset picker
const updater = require("../electron/updater.cjs");
const fakeAssets = [
  { name: "Grok-Build-Setup-0.1.9.exe", browser_download_url: "https://example.com/setup.exe", size: 1 },
  { name: "Grok-Build-0.1.9-arm64.dmg", browser_download_url: "https://example.com/a.dmg", size: 2 },
  { name: "Grok-Build-0.1.9-x64.dmg", browser_download_url: "https://example.com/x.dmg", size: 3 },
  { name: "source.tar.gz", browser_download_url: "https://example.com/src", size: 4 },
];
const picked = updater.pickDownloadAsset(fakeAssets);
ok("pickDownloadAsset returns something", Boolean(picked?.name), picked?.name);
if (process.platform === "darwin") {
  ok("mac prefers dmg", /\.dmg$/i.test(picked?.name || ""), picked?.name);
  if (process.arch === "arm64") {
    ok("mac arm64 prefers arm64 dmg", /arm64/i.test(picked?.name || ""), picked?.name);
  }
} else if (process.platform === "win32") {
  ok("win prefers exe", /\.exe$/i.test(picked?.name || ""), picked?.name);
}
ok("compareSemver", updater.compareSemver("0.1.9", "0.1.8") === 1);
ok("resolveGithubRepo default", Boolean(updater.resolveGithubRepo({})));

// Auth path readable
const auth = require("../electron/auth.cjs");
const authPath = auth.authFilePath();
ok("auth path under .grok", authPath.includes(".grok"), authPath);

// package.json mac config
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
ok("dist:mac script", Boolean(pkg.scripts["dist:mac"]));
ok("build.mac present", Boolean(pkg.build?.mac));

// Optional: local DMG from last dist:mac
const releaseDir = path.join(root, "release");
if (fs.existsSync(releaseDir)) {
  const dmgs = fs.readdirSync(releaseDir).filter((n) => n.endsWith(".dmg"));
  if (dmgs.length) console.log(`  info local dmg: ${dmgs.join(", ")}`);
}

console.log("");
if (failed) {
  console.error(`FAILED ${failed} check(s)`);
  process.exit(1);
}
console.log("All checks passed.");
