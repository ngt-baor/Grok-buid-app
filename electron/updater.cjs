/**
 * GitHub Releases updater for Grok Build.
 *
 * Flow: check latest release → compare semver → download asset with progress → open installer.
 * Always updates from the official public repo (DEFAULT_UPDATE_REPO). Optional overrides:
 *   1. settings.updateGithubRepo ("owner/repo")
 *   2. env GROK_BUILD_UPDATE_REPO
 *   3. package.json repository / grokBuild.updateRepo
 *   4. DEFAULT_UPDATE_REPO (hard fallback)
 *
 * Prefers .exe/.msi from GitHub Releases; falls back to release page.
 */

/** Canonical update source — always used when nothing else is configured. */
const DEFAULT_UPDATE_REPO = "ngt-baor/Grok-buid-app";
const fs = require("node:fs");
const path = require("node:path");
const https = require("node:https");
const http = require("node:http");
const { app, shell } = require("electron");

const USER_AGENT = "GrokBuildApp-Updater";
const MAX_REDIRECTS = 8;

/** @type {{ abort: (() => void) | null, destPath: string | null }} */
const downloadState = {
  abort: null,
  destPath: null,
};

function readPackageJson() {
  try {
    const pkgPath = path.join(app.getAppPath(), "package.json");
    if (fs.existsSync(pkgPath)) {
      return JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    }
  } catch {
    /* ignore */
  }
  try {
    // dev: main lives in electron/ → project root
    const pkgPath = path.join(__dirname, "..", "package.json");
    if (fs.existsSync(pkgPath)) {
      return JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    }
  } catch {
    /* ignore */
  }
  return {};
}

/**
 * Parse "owner/repo" from common GitHub URL shapes.
 * @param {string} raw
 * @returns {string | null}
 */
function parseGithubRepo(raw) {
  if (!raw || typeof raw !== "string") return null;
  const s = raw.trim().replace(/\.git$/i, "");
  if (!s) return null;
  // already owner/repo
  if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(s)) return s;
  try {
    const u = new URL(s.replace(/^git\+/, ""));
    if (!/github\.com$/i.test(u.hostname)) return null;
    const parts = u.pathname.replace(/^\/+/, "").split("/").filter(Boolean);
    if (parts.length >= 2) return `${parts[0]}/${parts[1]}`;
  } catch {
    /* ignore */
  }
  const m = s.match(/github\.com[/:]([^/]+)\/([^/\s#?]+)/i);
  if (m) return `${m[1]}/${m[2].replace(/\.git$/i, "")}`;
  return null;
}

/**
 * @param {{ updateGithubRepo?: string } | null | undefined} settings
 * @returns {string | null}
 */
function resolveGithubRepo(settings) {
  // Always track the public release repo. Env can override for forks/dev only.
  const fromEnv = parseGithubRepo(process.env.GROK_BUILD_UPDATE_REPO || "");
  if (fromEnv) return fromEnv;

  const pkg = readPackageJson();
  const fromGrokBuild = parseGithubRepo(pkg?.grokBuild?.updateRepo || "");
  if (fromGrokBuild) return fromGrokBuild;

  const repoField = pkg?.repository;
  if (typeof repoField === "string") {
    const p = parseGithubRepo(repoField);
    if (p) return p;
  } else if (repoField && typeof repoField === "object") {
    const p = parseGithubRepo(repoField.url || "");
    if (p) return p;
  }

  // settings.updateGithubRepo is display/legacy only — do not divert updates away
  // from the official repo unless package.json is misconfigured.
  void settings;
  return DEFAULT_UPDATE_REPO;
}

/**
 * @param {string} a
 * @param {string} b
 * @returns {number} 1 if a>b, -1 if a<b, 0 equal
 */
function compareSemver(a, b) {
  const pa = String(a || "0")
    .replace(/^v/i, "")
    .split(/[+-]/)[0]
    .split(".")
    .map((x) => parseInt(x, 10) || 0);
  const pb = String(b || "0")
    .replace(/^v/i, "")
    .split(/[+-]/)[0]
    .split(".")
    .map((x) => parseInt(x, 10) || 0);
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const da = pa[i] || 0;
    const db = pb[i] || 0;
    if (da > db) return 1;
    if (da < db) return -1;
  }
  return 0;
}

function getAppVersionInfo() {
  const pkg = readPackageJson();
  let version = "0.0.0";
  let isPackaged = false;
  try {
    if (app && typeof app.getVersion === "function") {
      version = app.getVersion() || pkg.version || "0.0.0";
      isPackaged = Boolean(app.isPackaged);
    } else {
      version = pkg.version || "0.0.0";
    }
  } catch {
    version = pkg.version || "0.0.0";
  }
  return {
    version: String(version).replace(/^v/i, ""),
    name: pkg.productName || pkg.name || "Grok Build",
    isPackaged,
    electron: process.versions.electron || null,
    platform: process.platform,
    arch: process.arch,
  };
}

/**
 * @param {string} url
 * @param {{ headers?: Record<string, string>, timeoutMs?: number }} [opts]
 * @returns {Promise<{ status: number, headers: import('http').IncomingHttpHeaders, body: Buffer }>}
 */
function httpGetBuffer(url, opts = {}) {
  return new Promise((resolve, reject) => {
    let redirects = 0;
    const go = (current) => {
      const lib = current.startsWith("http://") ? http : https;
      const req = lib.get(
        current,
        {
          headers: {
            "User-Agent": USER_AGENT,
            Accept: "application/vnd.github+json",
            ...(opts.headers || {}),
          },
          timeout: opts.timeoutMs || 25000,
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
            const next = new URL(res.headers.location, current).toString();
            go(next);
            return;
          }
          /** @type {Buffer[]} */
          const chunks = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () => {
            resolve({
              status,
              headers: res.headers,
              body: Buffer.concat(chunks),
            });
          });
          res.on("error", reject);
        }
      );
      req.on("timeout", () => {
        req.destroy(new Error("Timeout khi gọi GitHub API"));
      });
      req.on("error", reject);
    };
    go(url);
  });
}

/**
 * Prefer Windows installer assets; then portable; then any binary-ish asset.
 * @param {any[]} assets
 */
function pickDownloadAsset(assets) {
  const list = Array.isArray(assets) ? assets : [];
  const arch = process.arch; // arm64 | x64 | …
  const scored = list
    .filter((a) => a && a.browser_download_url && a.name)
    .map((a) => {
      const name = String(a.name).toLowerCase();
      let score = 0;
      if (process.platform === "win32") {
        if (name.endsWith(".exe") && /setup|install|nsis/i.test(name)) score = 100;
        else if (name.endsWith(".exe")) score = 90;
        else if (name.endsWith(".msi")) score = 85;
        else if (name.endsWith(".zip") && !/source|src/i.test(name)) score = 50;
      } else if (process.platform === "darwin") {
        if (name.endsWith(".dmg")) score = 100;
        else if (name.endsWith(".zip") && !/source|src/i.test(name) && /mac|darwin/i.test(name))
          score = 70;
        else if (name.endsWith(".zip") && !/source|src/i.test(name)) score = 55;
        // Prefer matching CPU arch when filename encodes it
        if (score > 0) {
          if (arch === "arm64" && /arm64|aarch64|apple.?silicon/i.test(name)) score += 15;
          if (arch === "x64" && /(x64|x86_64|amd64)/i.test(name) && !/arm64|aarch64/i.test(name))
            score += 15;
          if (arch === "arm64" && /(x64|x86_64|amd64)/i.test(name) && !/arm64|universal/i.test(name))
            score -= 20;
        }
      } else {
        if (name.endsWith(".AppImage")) score = 100;
        else if (name.endsWith(".deb")) score = 80;
        else if (name.endsWith(".rpm")) score = 70;
      }
      if (/source|src\.tar|\.tar\.gz$/i.test(name)) score = 0;
      return { asset: a, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.asset || null;
}

/**
 * @param {{ updateGithubRepo?: string } | null | undefined} settings
 */
async function checkForUpdates(settings) {
  const current = getAppVersionInfo();
  const repo = resolveGithubRepo(settings);

  if (!repo) {
    return {
      ok: false,
      status: "no_repo",
      currentVersion: current.version,
      latestVersion: null,
      updateAvailable: false,
      message:
        "Chưa resolve được GitHub repo (kỳ vọng ngt-baor/Grok-buid-app). Kiểm tra package.json / mạng, rồi tạo release v1.0.0.",
      releaseUrl: null,
      asset: null,
      body: null,
      publishedAt: null,
      repo: null,
    };
  }

  const apiUrl = `https://api.github.com/repos/${repo}/releases/latest`;
  let res;
  try {
    res = await httpGetBuffer(apiUrl, {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
  } catch (err) {
    return {
      ok: false,
      status: "network_error",
      currentVersion: current.version,
      latestVersion: null,
      updateAvailable: false,
      message: `Không kết nối được GitHub: ${err?.message || err}`,
      releaseUrl: `https://github.com/${repo}/releases`,
      asset: null,
      body: null,
      publishedAt: null,
      repo,
    };
  }

  if (res.status === 404) {
    return {
      ok: true,
      status: "no_release",
      currentVersion: current.version,
      latestVersion: null,
      updateAvailable: false,
      message: `Repo ${repo} chưa có release (hoặc private/404). Sau khi push + tag v1.0.0, bấm kiểm tra lại.`,
      releaseUrl: `https://github.com/${repo}/releases`,
      asset: null,
      body: null,
      publishedAt: null,
      repo,
    };
  }

  if (res.status === 403) {
    const msg = res.body.toString("utf8").slice(0, 200);
    return {
      ok: false,
      status: "rate_limited",
      currentVersion: current.version,
      latestVersion: null,
      updateAvailable: false,
      message: `GitHub từ chối (403). Có thể rate-limit API. ${msg}`,
      releaseUrl: `https://github.com/${repo}/releases`,
      asset: null,
      body: null,
      publishedAt: null,
      repo,
    };
  }

  if (res.status < 200 || res.status >= 300) {
    return {
      ok: false,
      status: "api_error",
      currentVersion: current.version,
      latestVersion: null,
      updateAvailable: false,
      message: `GitHub API HTTP ${res.status}`,
      releaseUrl: `https://github.com/${repo}/releases`,
      asset: null,
      body: null,
      publishedAt: null,
      repo,
    };
  }

  let release;
  try {
    release = JSON.parse(res.body.toString("utf8"));
  } catch {
    return {
      ok: false,
      status: "parse_error",
      currentVersion: current.version,
      latestVersion: null,
      updateAvailable: false,
      message: "Không parse được phản hồi GitHub Releases.",
      releaseUrl: `https://github.com/${repo}/releases`,
      asset: null,
      body: null,
      publishedAt: null,
      repo,
    };
  }

  const tag = String(release.tag_name || release.name || "").trim();
  const latestVersion = tag.replace(/^v/i, "");
  if (!latestVersion) {
    return {
      ok: true,
      status: "no_release",
      currentVersion: current.version,
      latestVersion: null,
      updateAvailable: false,
      message: "Release mới nhất không có tag version.",
      releaseUrl: release.html_url || `https://github.com/${repo}/releases`,
      asset: null,
      body: release.body || null,
      publishedAt: release.published_at || null,
      repo,
    };
  }

  const cmp = compareSemver(latestVersion, current.version);
  const updateAvailable = cmp > 0;
  const asset = pickDownloadAsset(release.assets || []);
  const assetInfo = asset
    ? {
        name: asset.name,
        size: asset.size || 0,
        url: asset.browser_download_url,
      }
    : null;
  const releaseUrl =
    release.html_url || `https://github.com/${repo}/releases/tag/${tag}`;
  const platformLabel =
    process.platform === "darwin"
      ? "macOS"
      : process.platform === "win32"
        ? "Windows"
        : process.platform;

  if (!updateAvailable) {
    return {
      ok: true,
      status: "up_to_date",
      currentVersion: current.version,
      latestVersion,
      updateAvailable: false,
      message:
        cmp === 0
          ? `Bạn đang dùng bản mới nhất (v${current.version}).`
          : `Bản local (v${current.version}) mới hơn release (v${latestVersion}).`,
      releaseUrl,
      asset: assetInfo,
      body: release.body || null,
      publishedAt: release.published_at || null,
      repo,
      platform: process.platform,
      arch: process.arch,
    };
  }

  // Newer release exists but no installer for this OS/arch (e.g. Win-only release).
  if (!assetInfo) {
    return {
      ok: true,
      status: "update_no_asset",
      currentVersion: current.version,
      latestVersion,
      updateAvailable: true,
      canDownload: false,
      message: `Có bản mới v${latestVersion}, nhưng release chưa có gói ${platformLabel} (${process.arch}). Mở trang release để kiểm tra sau.`,
      releaseUrl,
      asset: null,
      body: release.body || null,
      publishedAt: release.published_at || null,
      repo,
      platform: process.platform,
      arch: process.arch,
    };
  }

  return {
    ok: true,
    status: "update_available",
    currentVersion: current.version,
    latestVersion,
    updateAvailable: true,
    canDownload: true,
    message: `Có bản mới v${latestVersion} (hiện tại v${current.version}) — ${assetInfo.name}`,
    releaseUrl,
    asset: assetInfo,
    body: release.body || null,
    publishedAt: release.published_at || null,
    repo,
    platform: process.platform,
    arch: process.arch,
  };
}

/**
 * Download a URL to dest with progress callbacks. Supports redirects + cancel.
 * @param {string} url
 * @param {string} destPath
 * @param {(p: {
 *   phase: string,
 *   received: number,
 *   total: number,
 *   percent: number,
 *   bytesPerSecond: number,
 *   speedLabel: string,
 * }) => void} onProgress
 * @returns {Promise<{ ok: boolean, path: string, received: number, total: number }>}
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
    downloadState.destPath = destPath;

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
              phase: "done",
              received,
              total: total || received,
              percent: 100,
              bytesPerSecond: received / Math.max((Date.now() - started) / 1000, 0.001),
              speedLabel: formatSpeed(
                received / Math.max((Date.now() - started) / 1000, 0.001)
              ),
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

function downloadsDir() {
  return path.join(app.getPath("userData"), "updates");
}

/**
 * @param {{ name: string, url: string, size?: number }} asset
 * @param {(p: object) => void} onProgress
 */
async function downloadUpdate(asset, onProgress) {
  if (!asset?.url || !asset?.name) {
    const need =
      process.platform === "darwin"
        ? ".dmg hoặc .zip"
        : process.platform === "win32"
          ? ".exe/.msi"
          : "AppImage/deb";
    throw new Error(
      `Không có file cài đặt phù hợp trong release (cần ${need} cho ${process.platform}).`
    );
  }
  // Cancel any prior download
  if (downloadState.abort) {
    try {
      downloadState.abort();
    } catch {
      /* ignore */
    }
  }

  const safeName = String(asset.name).replace(/[^\w.\-() ]+/g, "_");
  const dest = path.join(downloadsDir(), safeName);

  onProgress({
    phase: "starting",
    received: 0,
    total: asset.size || 0,
    percent: 0,
    bytesPerSecond: 0,
    speedLabel: "—",
    fileName: safeName,
    destPath: dest,
  });

  const result = await downloadFile(asset.url, dest, (p) => {
    onProgress({
      ...p,
      fileName: safeName,
      destPath: dest,
      receivedLabel: formatBytes(p.received),
      totalLabel: p.total ? formatBytes(p.total) : "?",
    });
  });

  return {
    ok: true,
    path: result.path,
    received: result.received,
    total: result.total,
    fileName: safeName,
    receivedLabel: formatBytes(result.received),
    totalLabel: formatBytes(result.total || result.received),
  };
}

function cancelDownload() {
  if (downloadState.abort) {
    downloadState.abort();
    downloadState.abort = null;
    return { ok: true, cancelled: true };
  }
  return { ok: true, cancelled: false };
}

/**
 * Open downloaded installer / show in folder.
 * Windows: run Setup .exe. macOS: open .dmg (Finder mount) or reveal .zip.
 * @param {string} filePath
 * @param {"open" | "reveal"} mode
 */
async function applyUpdate(filePath, mode = "open") {
  if (!filePath || !fs.existsSync(filePath)) {
    return { ok: false, error: "File cập nhật không tồn tại." };
  }
  if (mode === "reveal") {
    shell.showItemInFolder(filePath);
    return { ok: true, action: "reveal", path: filePath };
  }

  const lower = String(filePath).toLowerCase();

  // macOS: prefer `open` so Gatekeeper / disk image mount works like double-click.
  if (process.platform === "darwin" && (lower.endsWith(".dmg") || lower.endsWith(".zip"))) {
    try {
      const { spawn } = require("node:child_process");
      await new Promise((resolve, reject) => {
        const child = spawn("open", [filePath], {
          detached: true,
          stdio: "ignore",
        });
        child.on("error", reject);
        child.unref();
        // open returns quickly; treat spawn success as OK
        setTimeout(resolve, 200);
      });
      return {
        ok: true,
        action: "open",
        path: filePath,
        hint: lower.endsWith(".dmg")
          ? "Kéo Grok Build vào Applications, rồi mở app từ đó."
          : "Giải nén .zip và thay app trong Applications.",
      };
    } catch (err) {
      shell.showItemInFolder(filePath);
      return {
        ok: false,
        error: String(err?.message || err),
        action: "reveal",
        path: filePath,
      };
    }
  }

  const err = await shell.openPath(filePath);
  if (err) {
    // fallback: reveal
    shell.showItemInFolder(filePath);
    return { ok: false, error: err, action: "reveal", path: filePath };
  }
  return { ok: true, action: "open", path: filePath };
}

module.exports = {
  getAppVersionInfo,
  resolveGithubRepo,
  checkForUpdates,
  downloadUpdate,
  cancelDownload,
  applyUpdate,
  compareSemver,
  pickDownloadAsset,
  formatBytes,
  formatSpeed,
  parseGithubRepo,
  downloadFile,
  DEFAULT_UPDATE_REPO,
};
