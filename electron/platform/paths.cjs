/**
 * Cross-platform Grok CLI path helpers (Windows + macOS + Linux).
 * Single source of truth for default binary names and PATH resolution.
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

function grokHome() {
  return path.join(os.homedir(), ".grok");
}

function defaultBinDir() {
  return path.join(grokHome(), "bin");
}

function defaultDownloadDir() {
  return path.join(grokHome(), "downloads");
}

/** Primary on-disk binary name for this OS. */
function defaultGrokBinaryName() {
  return process.platform === "win32" ? "grok.exe" : "grok";
}

function defaultAgentBinaryName() {
  return process.platform === "win32" ? "agent.exe" : "agent";
}

/** Full path: ~/.grok/bin/grok(.exe) */
function defaultGrokPath() {
  return path.join(defaultBinDir(), defaultGrokBinaryName());
}

/**
 * xAI CLI platform triple used in artifact names.
 * @returns {string | null}
 */
function platformTriple() {
  const arch = process.arch === "arm64" ? "aarch64" : "x86_64";
  if (process.platform === "win32") return `windows-${arch}`;
  if (process.platform === "darwin") return `macos-${arch}`;
  if (process.platform === "linux") return `linux-${arch}`;
  return null;
}

/**
 * Ordered candidate paths for the Grok binary.
 * @param {string | undefined} settingsGrokPath
 * @returns {string[]}
 */
function candidateBinaries(settingsGrokPath) {
  const bin = defaultBinDir();
  const primary = path.join(bin, defaultGrokBinaryName());
  const secondary =
    process.platform === "win32"
      ? path.join(bin, "grok")
      : path.join(bin, "grok.exe");
  const list = [settingsGrokPath, primary, secondary].filter(Boolean);
  return [...new Set(list)];
}

/**
 * Resolve a command on PATH (where.exe on Windows, which elsewhere).
 * @param {string} cmd
 * @returns {string | null}
 */
function resolveOnPath(cmd) {
  try {
    if (process.platform === "win32") {
      const out = execFileSync("where.exe", [cmd], {
        encoding: "utf8",
        windowsHide: true,
        timeout: 4000,
      });
      const line = String(out)
        .split(/\r?\n/)
        .map((s) => s.trim())
        .find((s) => s && fs.existsSync(s));
      return line || null;
    }
    const out = execFileSync("which", [cmd], {
      encoding: "utf8",
      timeout: 4000,
    });
    const line = String(out)
      .split(/\r?\n/)
      .map((s) => s.trim())
      .find((s) => s && fs.existsSync(s));
    return line || null;
  } catch {
    return null;
  }
}

/**
 * Whether path points at an existing file (follows symlinks).
 * @param {string} p
 */
function isExistingFile(p) {
  try {
    if (!p || p === "grok") return false;
    if (!fs.existsSync(p)) return false;
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

/**
 * Resolve best Grok binary path for spawn/login/ACP.
 * @param {string | undefined} settingsGrokPath
 * @returns {string}
 */
function resolveGrokBinary(settingsGrokPath) {
  for (const c of candidateBinaries(settingsGrokPath)) {
    if (isExistingFile(c)) return path.resolve(c);
  }
  const fromPath = resolveOnPath("grok");
  if (fromPath) return fromPath;
  // Prefer absolute default if present
  const def = defaultGrokPath();
  if (isExistingFile(def)) return def;
  return settingsGrokPath || "grok";
}

module.exports = {
  grokHome,
  defaultBinDir,
  defaultDownloadDir,
  defaultGrokBinaryName,
  defaultAgentBinaryName,
  defaultGrokPath,
  platformTriple,
  candidateBinaries,
  resolveOnPath,
  isExistingFile,
  resolveGrokBinary,
};
