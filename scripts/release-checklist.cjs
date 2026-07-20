const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = process.cwd();
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const version = String(pkg.version || "").trim();
if (!version) throw new Error("package.json missing version");

const releaseDir = path.join(root, "release");
const mode = String(process.argv[2] || "all").replace(/^--platform=/, "");

const winRequired = [
  `Grok-Build-Setup-${version}.exe`,
  `Grok-Build-Setup-${version}.exe.blockmap`,
  `Grok-Build-Portable-${version}.exe`,
  "latest.yml",
];

// electron-builder mac artifactName: Grok-Build-${version}-${arch}.${ext}
const macRequired = [
  `Grok-Build-${version}-arm64.dmg`,
  `Grok-Build-${version}-arm64.zip`,
];

const macOptional = [
  `Grok-Build-${version}-x64.dmg`,
  `Grok-Build-${version}-x64.zip`,
  "latest-mac.yml",
];

function exists(name) {
  return fs.existsSync(path.join(releaseDir, name));
}

function mb(name) {
  const bytes = fs.statSync(path.join(releaseDir, name)).size;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function checkList(title, required, optional = []) {
  console.log(title);
  let missing = 0;
  for (const name of required) {
    if (exists(name)) console.log(`  OK      ${name}  ${mb(name)}`);
    else {
      missing += 1;
      console.log(`  MISSING ${name}`);
    }
  }
  for (const name of optional) {
    if (exists(name)) console.log(`  OK(opt) ${name}  ${mb(name)}`);
    else console.log(`  skip    ${name}`);
  }
  return missing;
}

let git = "not checked from this runtime; run: git status --short --branch";
try {
  git = execFileSync(process.platform === "win32" ? "git.exe" : "git", ["status", "--short", "--branch"], {
    encoding: "utf8",
  }).trim();
} catch {
  /* ignore */
}

console.log(`Grok Build release checklist v${version} (mode=${mode})`);
console.log("");
console.log("Before building:");
console.log("  1. npm version <next> --no-git-tag-version");
console.log("  2. npm run build");
console.log("  3. npm run dist:win   # on Windows runner");
console.log("  4. npm run dist:mac   # on macOS runner");
console.log("  5. npm run smoke:ui");
console.log("");

let missing = 0;
if (mode === "win" || mode === "all") {
  console.log("Upload Windows assets to the SAME GitHub Release tag:");
  missing += checkList("Windows:", winRequired);
  console.log("");
}
if (mode === "mac" || mode === "all") {
  console.log("Upload macOS assets to the SAME GitHub Release tag:");
  missing += checkList("macOS:", macRequired, macOptional);
  console.log("");
}

console.log("Do not upload:");
console.log("  - release/win-unpacked/  release/mac/");
console.log("  - release/.icon-ico/");
console.log("  - builder-debug.yml");
console.log("  - builder-effective-config.yaml");

const stale = fs.existsSync(releaseDir)
  ? fs
      .readdirSync(releaseDir)
      .filter(
        (name) =>
          /Grok[- ]Build.*\.(exe|blockmap|dmg|zip)$/i.test(name) && !name.includes(version)
      )
  : [];

if (stale.length) {
  console.log("");
  console.log("Old artifacts found; delete to avoid uploading the wrong version:");
  for (const name of stale) console.log(`  - ${name}`);
}

console.log("");
console.log("Git status:");
console.log(git || "clean");
console.log("");
console.log("Tip: node scripts/release-checklist.cjs win|mac|all");

if (missing) process.exit(1);
