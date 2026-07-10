/**
 * In-app Grok CLI installer (no visible terminal).
 * Mirrors official https://x.ai/cli/install.ps1:
 *   resolve channel version → download binary → ~/.grok/bin/grok.exe (+ agent.exe)
 * Progress events same shape as app updater for shared UI.
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const https = require("node:https");
const http = require("node:http");
const { spawn } = require("node:child_process");

const USER_AGENT = "GrokBuildApp-CliInstall";
const MAX_REDIRECTS = 8;
const BASE_PRIMARY = "https://x.ai/cli";
const BASE_FALLBACK = "https://storage.googleapis.com/grok-build-public-artifacts/cli";

/** @type {{ abort: (() => void) | null }} */
const downloadState = { abort: null };

function grokHome() {
  return path.join(os.homedir(), ".grok");
}

function defaultBinDir() {
  return path.join(grokHome(), "bin");
}

function defaultDownloadDir() {
  return path.join(grokHome(), "downloads");
}

function formatBytes(n) {
  const v = Number(n) || 0;
  if (v < 1024) return `${v} B`;
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`;
  if (v < 1024 * 1024 * 1024) return `${(v / (1024 * 1024)).toFixed(1)} MB`;
  return `${(v / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatSpeed(bps) {
  return `${formatBytes(bps)}/s`;
}

function platformTriple() {
  if (process.platform !== "win32") {
    return null;
  }
  // install.ps1: AMD64/x86 → x86_64, ARM64 → aarch64
  const arch = process.arch === "arm64" ? "aarch64" : "x86_64";
  return `windows-${arch}`;
}

function candidateBinaries(settingsGrokPath) {
  const list = [
    settingsGrokPath,
    path.join(defaultBinDir(), "grok.exe"),
    path.join(defaultBinDir(), "grok"),
  ].filter(Boolean);
  return [...new Set(list)];
}

/**
 * @param {string | undefined} settingsGrokPath
 */
function getCliStatus(settingsGrokPath) {
  const platform = platformTriple();
  const binDir = defaultBinDir();
  let resolved = null;
  for (const c of candidateBinaries(settingsGrokPath)) {
    try {
      if (c && fs.existsSync(c) && fs.statSync(c).isFile()) {
        resolved = c;
        break;
      }
    } catch {
      /* next */
    }
  }
  // Bare "grok" on PATH — only trust if we can find a real file via where.exe
  if (!resolved && process.platform === "win32") {
    try {
      const found = spawnSyncWhere("grok");
      if (found) resolved = found;
    } catch {
      /* ignore */
    }
  }

  return {
    ok: true,
    installed: Boolean(resolved),
    path: resolved,
    binDir,
    platform,
    supported: platform != null,
    installCommand:
      process.platform === "win32"
        ? "irm https://x.ai/cli/install.ps1 | iex"
        : "curl -fsSL https://x.ai/cli/install.sh | bash",
    docsUrl: "https://docs.x.ai/build/overview",
  };
}

function spawnSyncWhere(cmd) {
  try {
    const { execFileSync } = require("node:child_process");
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
  } catch {
    return null;
  }
}

/**
 * @param {string} url
 * @returns {Promise<string>}
 */
function httpsGetText(url) {
  return new Promise((resolve, reject) => {
    let redirects = 0;
    const go = (current) => {
      const lib = current.startsWith("http://") ? http : https;
      const req = lib.get(
        current,
        {
          headers: { "User-Agent": USER_AGENT, Accept: "text/plain,*/*" },
          timeout: 20000,
        },
        (res) => {
          const status = res.statusCode || 0;
          if (
            status >= 300 &&
            status < 400 &&
            res.headers.location &&
            redirects < MAX_REDIRECTS
          ) {
            redirects += 1;
            res.resume();
            go(new URL(res.headers.location, current).toString());
            return;
          }
          let data = "";
          res.on("data", (c) => {
            data += c;
          });
          res.on("end", () => {
            if (status < 200 || status >= 300) {
              reject(new Error(`HTTP ${status} from ${current}`));
              return;
            }
            resolve(String(data || "").trim());
          });
        }
      );
      req.on("error", reject);
      req.setTimeout(20000, () => req.destroy(new Error("timeout")));
    };
    go(url);
  });
}

/**
 * @param {string} url
 * @param {string} destPath
 * @param {(p: object) => void} onProgress
 */
function downloadFile(url, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    let cancelled = false;
    /** @type {import('http').ClientRequest | null} */
    let activeReq = null;
    /** @type {fs.WriteStream | null} */
    let out = null;
    let redirects = 0;

    const cleanupPartial = () => {
      try {
        if (out) out.destroy();
      } catch {
        /* ignore */
      }
      try {
        if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
      } catch {
        /* ignore */
      }
    };

    downloadState.abort = () => {
      cancelled = true;
      try {
        activeReq?.destroy();
      } catch {
        /* ignore */
      }
      cleanupPartial();
    };

    const go = (current) => {
      if (cancelled) {
        reject(Object.assign(new Error("Đã hủy tải xuống"), { cancelled: true }));
        return;
      }
      const lib = current.startsWith("http://") ? http : https;
      activeReq = lib.get(
        current,
        {
          headers: {
            "User-Agent": USER_AGENT,
            Accept: "application/octet-stream",
          },
          timeout: 0,
        },
        (res) => {
          const status = res.statusCode || 0;
          if (
            status >= 300 &&
            status < 400 &&
            res.headers.location &&
            redirects < MAX_REDIRECTS
          ) {
            redirects += 1;
            res.resume();
            go(new URL(res.headers.location, current).toString());
            return;
          }
          if (status < 200 || status >= 300) {
            res.resume();
            reject(new Error(`Tải thất bại HTTP ${status}`));
            return;
          }

          const total = parseInt(String(res.headers["content-length"] || "0"), 10) || 0;
          let received = 0;
          const started = Date.now();
          let lastEmit = 0;

          try {
            fs.mkdirSync(path.dirname(destPath), { recursive: true });
          } catch {
            /* ignore */
          }
          out = fs.createWriteStream(destPath);

          const emit = (force = false) => {
            const now = Date.now();
            if (!force && now - lastEmit < 120) return;
            lastEmit = now;
            const elapsed = Math.max((now - started) / 1000, 0.001);
            const bps = received / elapsed;
            const percent = total > 0 ? Math.min(100, (received / total) * 100) : 0;
            onProgress({
              phase: "downloading",
              received,
              total,
              percent,
              bytesPerSecond: bps,
              speedLabel: formatSpeed(bps),
              receivedLabel: formatBytes(received),
              totalLabel: total ? formatBytes(total) : "?",
            });
          };

          res.on("data", (chunk) => {
            if (cancelled) return;
            received += chunk.length;
            emit(false);
          });
          res.pipe(out);

          out.on("finish", () => {
            if (cancelled) {
              cleanupPartial();
              reject(Object.assign(new Error("Đã hủy tải xuống"), { cancelled: true }));
              return;
            }
            emit(true);
            onProgress({
              phase: "installing",
              received,
              total: total || received,
              percent: 100,
              bytesPerSecond: received / Math.max((Date.now() - started) / 1000, 0.001),
              speedLabel: formatSpeed(
                received / Math.max((Date.now() - started) / 1000, 0.001)
              ),
              receivedLabel: formatBytes(received),
              totalLabel: formatBytes(total || received),
            });
            downloadState.abort = null;
            resolve({ ok: true, path: destPath, received, total: total || received });
          });
          out.on("error", (err) => {
            cleanupPartial();
            reject(err);
          });
          res.on("error", (err) => {
            cleanupPartial();
            reject(err);
          });
        }
      );

      activeReq.on("error", (err) => {
        if (cancelled) {
          reject(Object.assign(new Error("Đã hủy tải xuống"), { cancelled: true }));
          return;
        }
        cleanupPartial();
        reject(err);
      });
    };

    go(url);
  });
}

/**
 * Copy binary into place; if locked, rename old → .old then copy (install.ps1 pattern).
 * @param {string} src
 * @param {string} dest
 */
function installBinaryLockedSafe(src, dest) {
  const old = `${dest}.old`;
  try {
    if (fs.existsSync(old)) fs.unlinkSync(old);
  } catch {
    /* ignore */
  }
  try {
    fs.copyFileSync(src, dest);
    return;
  } catch {
    /* locked — try rename dance */
  }
  try {
    if (fs.existsSync(dest)) {
      try {
        fs.renameSync(dest, old);
      } catch {
        /* ignore */
      }
    }
    fs.copyFileSync(src, dest);
  } catch (err) {
    try {
      if (fs.existsSync(old) && !fs.existsSync(dest)) fs.renameSync(old, dest);
    } catch {
      /* ignore */
    }
    throw err;
  }
}

/**
 * Prepend binDir to user PATH if missing (Windows).
 * @param {string} binDir
 */
function ensureUserPath(binDir) {
  if (process.platform !== "win32") return { ok: true, added: false };
  return new Promise((resolve) => {
    const ps = `
$bin = '${String(binDir).replace(/'/g, "''")}'
$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
$entries = if ($userPath) { $userPath -split ';' | Where-Object { $_ -ne '' } } else { @() }
if ($entries -contains $bin) { Write-Output 'ALREADY'; exit 0 }
$newPath = (@($bin) + $entries) -join ';'
[Environment]::SetEnvironmentVariable('Path', $newPath, 'User')
Write-Output 'ADDED'
`;
    const child = spawn(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps],
      { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }
    );
    let out = "";
    child.stdout?.on("data", (c) => {
      out += c;
    });
    child.on("error", () => resolve({ ok: false, added: false }));
    child.on("close", () => {
      const added = /ADDED/i.test(out);
      // Current process PATH so subsequent spawns find grok immediately
      if (added || !process.env.Path?.includes(binDir)) {
        process.env.Path = `${binDir};${process.env.Path || process.env.PATH || ""}`;
      }
      resolve({ ok: true, added });
    });
  });
}

/**
 * @param {{ channel?: string }} opts
 * @param {(p: object) => void} onProgress
 */
async function installCli(opts = {}, onProgress = () => {}) {
  const platform = platformTriple();
  if (!platform) {
    throw new Error(
      "Cài CLI trong app hiện hỗ trợ Windows. Dùng: curl -fsSL https://x.ai/cli/install.sh | bash"
    );
  }

  if (downloadState.abort) {
    try {
      downloadState.abort();
    } catch {
      /* ignore */
    }
  }

  const channel = (opts.channel || process.env.GROK_CHANNEL || "stable").trim() || "stable";
  const binDir = defaultBinDir();
  const downloadDir = defaultDownloadDir();
  fs.mkdirSync(binDir, { recursive: true });
  fs.mkdirSync(downloadDir, { recursive: true });

  const emit = (p) => {
    try {
      onProgress(p);
    } catch {
      /* ignore */
    }
  };

  emit({
    phase: "starting",
    received: 0,
    total: 0,
    percent: 0,
    bytesPerSecond: 0,
    speedLabel: "—",
    fileName: "Đang lấy phiên bản…",
    receivedLabel: "0 B",
    totalLabel: "?",
  });

  // Resolve base URL + version (same as install.ps1)
  let baseUrl = BASE_PRIMARY;
  let versionText = "";
  try {
    versionText = await httpsGetText(`${BASE_PRIMARY}/${channel}`);
    if (!String(versionText || "").trim()) throw new Error("empty version");
  } catch {
    baseUrl = BASE_FALLBACK;
    versionText = await httpsGetText(`${BASE_FALLBACK}/${channel}`);
  }
  const version = String(versionText || "").trim();
  if (!/^\d+\.\d+\.\d+(-\S+)?$/.test(version)) {
    throw new Error(
      `Không đọc được version CLI từ ${baseUrl}/${channel} (got: ${version || "empty"})`
    );
  }

  const fileName = `grok-${version}-${platform}.exe`;
  const destTmp = path.join(downloadDir, `grok-${platform}.exe`);
  // Prefer resolved base, then alternate CDN (x.ai ↔ GCS)
  const bases = [baseUrl, baseUrl === BASE_PRIMARY ? BASE_FALLBACK : BASE_PRIMARY];
  const urls = [];
  for (const b of bases) {
    const artifactBase = `${b}/grok-${version}-${platform}`;
    urls.push(`${artifactBase}.exe`, artifactBase);
  }

  emit({
    phase: "starting",
    received: 0,
    total: 0,
    percent: 0,
    bytesPerSecond: 0,
    speedLabel: "—",
    fileName,
    version,
    receivedLabel: "0 B",
    totalLabel: "?",
  });

  let lastErr = null;
  let downloaded = null;
  for (const url of urls) {
    try {
      downloaded = await downloadFile(url, destTmp, (p) => {
        emit({
          ...p,
          fileName,
          version,
          destPath: destTmp,
        });
      });
      lastErr = null;
      break;
    } catch (err) {
      lastErr = err;
      if (err?.cancelled) throw err;
      // try next URL
    }
  }
  if (!downloaded) {
    throw lastErr || new Error(`Binary download failed for grok-${version}-${platform}`);
  }

  emit({
    phase: "installing",
    received: downloaded.received,
    total: downloaded.total,
    percent: 100,
    bytesPerSecond: 0,
    speedLabel: "—",
    fileName,
    version,
    receivedLabel: formatBytes(downloaded.received),
    totalLabel: formatBytes(downloaded.total),
  });

  const grokDest = path.join(binDir, "grok.exe");
  const agentDest = path.join(binDir, "agent.exe");
  installBinaryLockedSafe(destTmp, grokDest);
  try {
    installBinaryLockedSafe(destTmp, agentDest);
  } catch {
    /* agent.exe optional if locked */
  }

  const pathResult = await ensureUserPath(binDir);

  // Best-effort completions (hidden, no terminal window)
  try {
    spawn(grokDest, ["completions", "powershell"], {
      windowsHide: true,
      stdio: "ignore",
      detached: true,
    }).unref();
  } catch {
    /* ignore */
  }

  emit({
    phase: "done",
    received: downloaded.received,
    total: downloaded.total,
    percent: 100,
    bytesPerSecond: 0,
    speedLabel: "—",
    fileName,
    version,
    destPath: grokDest,
    receivedLabel: formatBytes(downloaded.received),
    totalLabel: formatBytes(downloaded.total),
  });

  return {
    ok: true,
    version,
    path: grokDest,
    binDir,
    agentPath: agentDest,
    pathAdded: Boolean(pathResult?.added),
    fileName,
    received: downloaded.received,
    total: downloaded.total,
  };
}

function cancelCliInstall() {
  if (downloadState.abort) {
    downloadState.abort();
    downloadState.abort = null;
    return { ok: true, cancelled: true };
  }
  return { ok: true, cancelled: false };
}

module.exports = {
  getCliStatus,
  installCli,
  cancelCliInstall,
  defaultBinDir,
  platformTriple,
};
