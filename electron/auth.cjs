const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const https = require("node:https");
const querystring = require("node:querystring");
const { spawn } = require("node:child_process");

/** Official Grok CLI public OIDC client (same as install.ps1 / grok login). */
const OIDC_ISSUER = "https://auth.x.ai";
const OIDC_CLIENT_ID = "b1a00492-073a-47ea-816f-4c329264a828";
const OIDC_SCOPE_KEY = `${OIDC_ISSUER}::${OIDC_CLIENT_ID}`;
const OIDC_SCOPES =
  "openid profile email offline_access grok-cli:access team:read org:read";
const DEVICE_CODE_PATH = "/oauth2/device/code";
const TOKEN_PATH = "/oauth2/token";

/** @type {{ cancelled: boolean, gen: number }} */
const deviceLoginState = { cancelled: false, gen: 0 };

function authFilePath() {
  return path.join(os.homedir(), ".grok", "auth.json");
}

function readAuthFile() {
  const file = authFilePath();
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function getAuthEntry() {
  const raw = readAuthFile();
  if (!raw) return null;
  const key = Object.keys(raw)[0];
  if (!key) return null;
  return { scope: key, entry: raw[key], raw };
}

function isExpired(entry, skewMs = 120_000) {
  if (!entry?.expires_at) return false;
  const exp = Date.parse(entry.expires_at);
  if (!Number.isFinite(exp)) return false;
  return Date.now() >= exp - skewMs;
}

/**
 * POST application/x-www-form-urlencoded.
 * @param {boolean} allowErrorStatus — if true, resolve JSON even on 4xx (device-code poll).
 */
function httpsForm(hostname, pathname, bodyObj, allowErrorStatus = false) {
  const body = querystring.stringify(bodyObj);
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname,
        path: pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(body),
          Accept: "application/json",
          "User-Agent": "GrokBuildApp-Auth",
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          let parsed = null;
          try {
            parsed = data ? JSON.parse(data) : {};
          } catch {
            parsed = { raw: data };
          }
          if (!allowErrorStatus && res.statusCode && res.statusCode >= 400) {
            const msg =
              parsed?.error_description ||
              parsed?.error ||
              data.slice(0, 300) ||
              `HTTP ${res.statusCode}`;
            reject(new Error(`auth HTTP ${res.statusCode}: ${msg}`));
            return;
          }
          resolve({
            status: res.statusCode || 0,
            ...parsed,
          });
        });
      }
    );
    req.on("error", reject);
    req.setTimeout(20000, () => req.destroy(new Error("auth timeout")));
    req.write(body);
    req.end();
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Write CLI-compatible ~/.grok/auth.json from OIDC token response.
 * @param {object} tok
 */
function writeAuthFromTokenResponse(tok) {
  const access = tok.access_token;
  if (!access) throw new Error("Token response thiếu access_token.");

  const expiresIn = Number(tok.expires_in || 21600);
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
  const jwt = decodeJwtPayload(access) || {};
  const email =
    tok.email ||
    jwt.email ||
    jwt.preferred_username ||
    (typeof jwt.sub === "string" && jwt.sub.includes("@") ? jwt.sub : null);

  let raw = {};
  try {
    if (fs.existsSync(authFilePath())) {
      raw = JSON.parse(fs.readFileSync(authFilePath(), "utf8")) || {};
    }
  } catch {
    raw = {};
  }

  raw[OIDC_SCOPE_KEY] = {
    type: "oauth",
    key: access,
    token: access,
    access_token: access,
    refresh_token: tok.refresh_token || undefined,
    expires_at: expiresAt,
    expires_in: expiresIn,
    oidc_client_id: OIDC_CLIENT_ID,
    oidc_issuer: OIDC_ISSUER,
    email: email || undefined,
    id_token: tok.id_token || undefined,
    scope: tok.scope || OIDC_SCOPES,
  };

  const dir = path.dirname(authFilePath());
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(authFilePath(), JSON.stringify(raw, null, 2), "utf8");
  avatarCache = { key: null, url: null, at: 0 };

  return {
    path: authFilePath(),
    email: email || null,
    expiresAt,
    scope: OIDC_SCOPE_KEY,
  };
}

function httpsGetJson(hostname, pathname, headers) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname,
        path: pathname,
        method: "GET",
        headers: {
          Accept: "application/json",
          ...headers,
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
            return;
          }
          try {
            resolve(JSON.parse(data || "{}"));
          } catch (err) {
            reject(err);
          }
        });
      }
    );
    req.on("error", reject);
    req.setTimeout(10000, () => req.destroy(new Error("timeout")));
    req.end();
  });
}

/** Decode JWT payload without verifying signature (claims only). */
function decodeJwtPayload(token) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    return JSON.parse(Buffer.from(pad, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

/** Pull a https avatar URL from a nested JSON object. */
function pickPicture(obj, depth = 0) {
  if (!obj || typeof obj !== "object" || depth > 3) return null;
  const keys = [
    "picture",
    "avatar",
    "avatarUrl",
    "avatar_url",
    "profileImage",
    "profile_image",
    "profileImageUrl",
    "profile_image_url",
    "profilePicture",
    "profile_picture",
    "image",
    "imageUrl",
    "image_url",
    "photo",
    "photoUrl",
    "photo_url",
  ];
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && /^https?:\/\//i.test(v.trim())) {
      return v.trim();
    }
  }
  for (const nest of ["user", "profile", "data", "account", "me", "identity"]) {
    if (obj[nest] && typeof obj[nest] === "object") {
      const p = pickPicture(obj[nest], depth + 1);
      if (p) return p;
    }
  }
  return null;
}

/** In-memory avatar cache (avoid hammering userinfo on every poll). */
let avatarCache = { key: null, url: null, at: 0 };
const AVATAR_TTL_MS = 60 * 60 * 1000;

/**
 * Resolve Grok/xAI profile avatar for the logged-in account.
 * Sources (in order): auth.json fields → JWT claims → OIDC userinfo →
 * cli-chat-proxy user endpoints.
 */
async function resolveAvatarUrl(entry) {
  if (!entry) return null;

  const cacheKey = `${entry.email || ""}|${String(entry.key || "").slice(0, 24)}`;
  if (
    avatarCache.key === cacheKey &&
    avatarCache.at &&
    Date.now() - avatarCache.at < AVATAR_TTL_MS
  ) {
    return avatarCache.url;
  }

  const fromEntry = pickPicture(entry);
  if (fromEntry) {
    avatarCache = { key: cacheKey, url: fromEntry, at: Date.now() };
    return fromEntry;
  }

  const token = entry.key;
  if (!token) {
    avatarCache = { key: cacheKey, url: null, at: Date.now() };
    return null;
  }

  const fromJwt = pickPicture(decodeJwtPayload(token));
  if (fromJwt) {
    avatarCache = { key: cacheKey, url: fromJwt, at: Date.now() };
    return fromJwt;
  }

  const issuer = (entry.oidc_issuer || "https://auth.x.ai").replace(/\/$/, "");
  const userinfoPaths = ["/userinfo", "/oauth2/userinfo", "/v1/userinfo", "/oidc/userinfo"];
  for (const p of userinfoPaths) {
    try {
      const u = new URL(p, issuer + "/");
      const data = await httpsGetJson(u.hostname, u.pathname + (u.search || ""), {
        Authorization: `Bearer ${token}`,
      });
      const pic = pickPicture(data);
      if (pic) {
        avatarCache = { key: cacheKey, url: pic, at: Date.now() };
        return pic;
      }
    } catch {
      /* try next */
    }
  }

  const proxyPaths = [
    "/v1/user",
    "/v1/me",
    "/v1/profile",
    "/v1/account",
    "/v1/settings",
    "/v1/identity",
  ];
  for (const p of proxyPaths) {
    try {
      const data = await httpsGetJson("cli-chat-proxy.grok.com", p, {
        Authorization: `Bearer ${token}`,
        "X-XAI-Token-Auth": "xai-grok-cli",
        "User-Agent": "grok-build-app/0.2.0",
        "x-grok-client-version": "0.2.93",
      });
      const pic = pickPicture(data);
      if (pic) {
        avatarCache = { key: cacheKey, url: pic, at: Date.now() };
        return pic;
      }
    } catch {
      /* try next */
    }
  }

  avatarCache = { key: cacheKey, url: null, at: Date.now() };
  return null;
}

/**
 * Ensure a valid access token. Refreshes via OIDC and writes back auth.json.
 */
async function getValidAccessToken() {
  const pack = getAuthEntry();
  if (!pack?.entry?.key) {
    throw new Error("Chưa login Grok — chạy `grok login`.");
  }

  const { scope, entry, raw } = pack;
  if (!isExpired(entry) && entry.key) {
    return {
      token: entry.key,
      email: entry.email || null,
      expiresAt: entry.expires_at || null,
      refreshed: false,
    };
  }

  if (!entry.refresh_token || !entry.oidc_client_id) {
    throw new Error("Auth hết hạn và không có refresh_token — chạy `grok login`.");
  }

  const issuer = (entry.oidc_issuer || "https://auth.x.ai").replace(/\/$/, "");
  // token endpoint is typically {issuer}/oauth2/token for xAI
  const tokenUrl = new URL("/oauth2/token", issuer + "/");

  const tok = await httpsForm(tokenUrl.hostname, tokenUrl.pathname, {
    grant_type: "refresh_token",
    refresh_token: entry.refresh_token,
    client_id: entry.oidc_client_id,
  });

  if (!tok.access_token) {
    throw new Error("Refresh token không trả access_token.");
  }

  const expiresIn = Number(tok.expires_in || 21600);
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

  const nextEntry = {
    ...entry,
    key: tok.access_token,
    refresh_token: tok.refresh_token || entry.refresh_token,
    expires_at: expiresAt,
  };

  try {
    raw[scope] = nextEntry;
    fs.writeFileSync(authFilePath(), JSON.stringify(raw, null, 2), "utf8");
  } catch {
    // still return token even if write fails
  }

  // Token rotated — drop avatar cache so next status re-resolves
  avatarCache = { key: null, url: null, at: 0 };

  return {
    token: tok.access_token,
    email: entry.email || null,
    expiresAt,
    refreshed: true,
  };
}

async function authStatus() {
  const pack = getAuthEntry();
  if (!pack?.entry) {
    return {
      loggedIn: false,
      email: null,
      avatarUrl: null,
      expiresAt: null,
      path: authFilePath(),
    };
  }
  const expired = isExpired(pack.entry, 0);
  let avatarUrl = null;
  if (!expired && pack.entry.key) {
    try {
      avatarUrl = await resolveAvatarUrl(pack.entry);
    } catch {
      avatarUrl = null;
    }
  }
  return {
    loggedIn: !expired,
    expired,
    email: pack.entry.email || null,
    avatarUrl,
    expiresAt: pack.entry.expires_at || null,
    path: authFilePath(),
  };
}

/**
 * Resolve path to grok CLI binary for login spawn.
 * Prefers settings path, then default install, then bare `grok` on PATH.
 */
function resolveGrokBinary(grokPath) {
  const candidates = [
    grokPath,
    path.join(os.homedir(), ".grok", "bin", "grok.exe"),
    path.join(os.homedir(), ".grok", "bin", "grok"),
  ].filter(Boolean);

  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return c;
    } catch {
      /* try next */
    }
  }
  return grokPath || "grok";
}

/**
 * In-app OIDC device-code login (no terminal).
 * Opens browser + polls token endpoint; writes ~/.grok/auth.json like `grok login`.
 *
 * @param {(p: object) => void} onProgress
 * @param {{ openBrowser?: boolean }} opts
 */
async function startDeviceLogin(onProgress = () => {}, opts = {}) {
  const gen = ++deviceLoginState.gen;
  deviceLoginState.cancelled = false;
  const openBrowser = opts.openBrowser !== false;

  const emit = (p) => {
    try {
      onProgress(p);
    } catch {
      /* ignore */
    }
  };

  const issuerHost = "auth.x.ai";

  emit({ phase: "starting", message: "Đang lấy mã đăng nhập…" });

  let device;
  try {
    device = await httpsForm(issuerHost, DEVICE_CODE_PATH, {
      client_id: OIDC_CLIENT_ID,
      scope: OIDC_SCOPES,
    });
  } catch (err) {
    const msg = String(err?.message || err);
    emit({ phase: "error", error: msg });
    return { ok: false, error: msg, mode: "device" };
  }

  if (!device.device_code || !device.user_code) {
    const msg =
      device.error_description ||
      device.error ||
      "OIDC device/code không trả user_code.";
    emit({ phase: "error", error: msg });
    return { ok: false, error: msg, mode: "device", detail: device };
  }

  const userCode = String(device.user_code);
  const verificationUri =
    device.verification_uri_complete ||
    device.verification_uri ||
    "https://auth.x.ai/device";
  const verificationUriBase =
    device.verification_uri || "https://auth.x.ai/device";
  const expiresIn = Number(device.expires_in || 900);
  let intervalSec = Math.max(3, Number(device.interval || 5));
  const deadline = Date.now() + expiresIn * 1000;

  emit({
    phase: "pending",
    userCode,
    verificationUri,
    verificationUriBase,
    expiresIn,
    interval: intervalSec,
    message: "Mở browser, đăng nhập và xác nhận mã.",
  });

  if (openBrowser) {
    try {
      const { shell } = require("electron");
      void shell.openExternal(verificationUri);
    } catch {
      /* user can click Open in UI */
    }
  }

  while (Date.now() < deadline) {
    if (deviceLoginState.cancelled || deviceLoginState.gen !== gen) {
      emit({ phase: "cancelled", message: "Đã hủy đăng nhập." });
      return { ok: false, cancelled: true, mode: "device" };
    }

    await sleep(intervalSec * 1000);

    if (deviceLoginState.cancelled || deviceLoginState.gen !== gen) {
      emit({ phase: "cancelled", message: "Đã hủy đăng nhập." });
      return { ok: false, cancelled: true, mode: "device" };
    }

    let tok;
    try {
      tok = await httpsForm(
        issuerHost,
        TOKEN_PATH,
        {
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
          device_code: device.device_code,
          client_id: OIDC_CLIENT_ID,
        },
        true
      );
    } catch (err) {
      // Network blip — keep polling
      emit({
        phase: "pending",
        userCode,
        verificationUri,
        verificationUriBase,
        message: `Lỗi mạng, đang thử lại… (${String(err?.message || err).slice(0, 80)})`,
      });
      continue;
    }

    if (tok.access_token) {
      try {
        const written = writeAuthFromTokenResponse(tok);
        emit({
          phase: "done",
          userCode,
          email: written.email,
          expiresAt: written.expiresAt,
          path: written.path,
          message: written.email
            ? `Đã đăng nhập: ${written.email}`
            : "Đã đăng nhập.",
        });
        return {
          ok: true,
          mode: "device",
          email: written.email,
          expiresAt: written.expiresAt,
          path: written.path,
          message: written.email
            ? `Đã đăng nhập: ${written.email}`
            : "Đã đăng nhập Grok / xAI.",
        };
      } catch (err) {
        const msg = String(err?.message || err);
        emit({ phase: "error", error: msg });
        return { ok: false, error: msg, mode: "device" };
      }
    }

    const errCode = String(tok.error || "");
    if (errCode === "authorization_pending") {
      emit({
        phase: "pending",
        userCode,
        verificationUri,
        verificationUriBase,
        message: "Đang chờ bạn xác nhận trên web…",
      });
      continue;
    }
    if (errCode === "slow_down") {
      intervalSec += 5;
      emit({
        phase: "pending",
        userCode,
        verificationUri,
        verificationUriBase,
        message: "Server yêu cầu chậm lại — đang chờ…",
      });
      continue;
    }
    if (errCode === "expired_token" || errCode === "expired_token_code") {
      const msg = "Mã đăng nhập hết hạn — thử lại.";
      emit({ phase: "error", error: msg });
      return { ok: false, error: msg, mode: "device" };
    }
    if (errCode === "access_denied") {
      const msg = "Bạn đã từ chối đăng nhập trên web.";
      emit({ phase: "error", error: msg });
      return { ok: false, error: msg, mode: "device" };
    }
    if (errCode) {
      const msg =
        tok.error_description || tok.error || `OIDC error: ${errCode}`;
      emit({ phase: "error", error: msg });
      return { ok: false, error: msg, mode: "device" };
    }
  }

  const msg = "Hết thời gian chờ xác nhận — thử đăng nhập lại.";
  emit({ phase: "error", error: msg });
  return { ok: false, error: msg, mode: "device" };
}

function cancelDeviceLogin() {
  deviceLoginState.cancelled = true;
  deviceLoginState.gen += 1;
  return { ok: true, cancelled: true };
}

/**
 * Fallback: open interactive terminal running `grok login`.
 */
function startLoginCli(grokPath) {
  const bin = resolveGrokBinary(grokPath);
  if (bin !== "grok" && !fs.existsSync(bin)) {
    return {
      ok: false,
      mode: "cli",
      error: `Không tìm thấy grok CLI: ${bin}. Cài Grok CLI trong app trước, hoặc set đường dẫn trong Cài đặt.`,
      binary: bin,
    };
  }

  try {
    if (process.platform === "win32") {
      const ps = [
        `$bin = '${String(bin).replace(/'/g, "''")}'`,
        `Write-Host 'Grok login — hoàn tất trong browser nếu được mở.' -ForegroundColor Cyan`,
        `Write-Host \"Binary: $bin\" -ForegroundColor DarkGray`,
        `Write-Host ''`,
        `& $bin login`,
        `$code = $LASTEXITCODE`,
        `Write-Host ''`,
        `if ($code -eq 0) { Write-Host 'Login xong. Dong cua so nay va quay lai app (hoac bam Lam moi).' -ForegroundColor Green }`,
        `else { Write-Host \"Login exit code: $code\" -ForegroundColor Yellow }`,
      ].join("; ");
      const child = spawn(
        "powershell.exe",
        ["-NoExit", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps],
        {
          detached: true,
          stdio: "ignore",
          windowsHide: false,
        }
      );
      child.unref();
    } else if (process.platform === "darwin") {
      const escaped = String(bin).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      const script = `tell application "Terminal" to do script "\\"${escaped}\\" login"`;
      const child = spawn("osascript", ["-e", script], {
        detached: true,
        stdio: "ignore",
      });
      child.unref();
    } else {
      const tryTerms = [
        ["x-terminal-emulator", ["-e", bin, "login"]],
        ["gnome-terminal", ["--", bin, "login"]],
        ["konsole", ["-e", bin, "login"]],
        ["xterm", ["-e", bin, "login"]],
      ];
      let launched = false;
      for (const [cmd, args] of tryTerms) {
        try {
          const child = spawn(cmd, args, {
            detached: true,
            stdio: "ignore",
          });
          child.on("error", () => {});
          child.unref();
          launched = true;
          break;
        } catch {
          /* try next */
        }
      }
      if (!launched) {
        const child = spawn(bin, ["login"], {
          detached: true,
          stdio: "ignore",
        });
        child.unref();
      }
    }
  } catch (err) {
    return {
      ok: false,
      mode: "cli",
      error: String(err?.message || err),
      binary: bin,
    };
  }

  return {
    ok: true,
    mode: "cli",
    binary: bin,
    message:
      "Đã mở terminal `grok login`. Hoàn tất trong browser/terminal, app sẽ đọc lại auth.json.",
  };
}

/** @deprecated use startDeviceLogin / startLoginCli */
function startLogin(grokPath) {
  return startLoginCli(grokPath);
}

/**
 * Clear local Grok OIDC session (~/.grok/auth.json).
 * Does not call a remote revoke endpoint (CLI has no stable public logout API here).
 */
async function logout() {
  avatarCache = { key: null, url: null, at: 0 };
  const file = authFilePath();
  try {
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
    }
  } catch (err) {
    // Fallback: wipe contents so getAuthEntry sees nothing
    try {
      fs.writeFileSync(file, "{}\n", "utf8");
    } catch (err2) {
      throw new Error(
        `Không xóa được auth.json: ${err2?.message || err2 || err?.message || err}`
      );
    }
  }
  return authStatus();
}

module.exports = {
  authFilePath,
  getAuthEntry,
  getValidAccessToken,
  authStatus,
  resolveAvatarUrl,
  resolveGrokBinary,
  startLogin,
  startLoginCli,
  startDeviceLogin,
  cancelDeviceLogin,
  logout,
  isExpired,
  OIDC_CLIENT_ID,
  OIDC_ISSUER,
};
