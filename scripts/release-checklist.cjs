const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = process.cwd();
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const version = String(pkg.version || "").trim();
if (!version) throw new Error("package.json missing version");

const releaseDir = path.join(root, "release");
const required = [
  `Grok-Build-Setup-${version}.exe`,
  `Grok-Build-Setup-${version}.exe.blockmap`,
  `Grok-Build-Portable-${version}.exe`,
  "latest.yml",
];

function exists(name) {
  return fs.existsSync(path.join(releaseDir, name));
}

function mb(name) {
  const bytes = fs.statSync(path.join(releaseDir, name)).size;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

let git = "not checked from this runtime; run: git status --short --branch";
try {
  git = execFileSync(process.platform === "win32" ? "git.exe" : "git", ["status", "--short", "--branch"], { encoding: "utf8" }).trim();
} catch {}

console.log(`Grok Build release checklist v${version}`);
console.log("");
console.log("Before building:");
console.log("  1. npm version <next> --no-git-tag-version");
console.log("  2. npm run build");
console.log("  3. npm run dist:win");
console.log("  4. npm run smoke:ui");
console.log("");
console.log("Upload these 4 files to GitHub Release:");
let missing = 0;
for (const name of required) {
  if (exists(name)) console.log(`  OK      ${name}  ${mb(name)}`);
  else {
    missing += 1;
    console.log(`  MISSING ${name}`);
  }
}

const stale = fs.existsSync(releaseDir)
  ? fs.readdirSync(releaseDir).filter((name) => /Grok[- ]Build.*\.(exe|blockmap)$/i.test(name) && !name.includes(version))
  : [];

console.log("");
console.log("Do not upload:");
console.log("  - release/win-unpacked/");
console.log("  - release/.icon-ico/");
console.log("  - builder-debug.yml");
console.log("  - builder-effective-config.yaml");

if (stale.length) {
  console.log("");
  console.log("Old artifacts found; delete to avoid uploading the wrong version:");
  for (const name of stale) console.log(`  - ${name}`);
}

console.log("");
console.log("Git status:");
console.log(git || "clean");

if (missing) process.exit(1);
