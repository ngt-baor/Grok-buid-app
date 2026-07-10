const fs = require("node:fs");
const path = require("node:path");
const { app, session } = require("electron");

/**
 * IndexedDB / LevelDB WAL hygiene for Electron.
 *
 * Chromium does not expose LevelDB db.close() / compactRange() to app code.
 * Practical controls:
 *  - flushStorageData() on orderly quit
 *  - clearStorageData({ storages: ['indexdb'] }) for a bloated origin
 *  - delete oversized origin folders on disk when safe
 *  - periodic size checks + auto-rebuild when over threshold / corrupt
 *
 * Also watches the official Grok Desktop path (%APPDATA%\grok) so this shell
 * can detect / help clean the known x.com WAL balloon without touching CLI ~/.grok.
 */

/** Soft warn when any single IndexedDB origin folder exceeds this */
const WARN_BYTES = 200 * 1024 * 1024; // 200 MB
/** Hard auto-purge threshold */
const PURGE_BYTES = 500 * 1024 * 1024; // 500 MB
/** Absolute emergency cap (user report was ~59 GB) */
const EMERGENCY_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB

const OFFICIAL_XCOM_ORIGIN = "https://x.com";
const OFFICIAL_IDB_DIR_NAME = "https_x.com_0.indexeddb.leveldb";

function officialGrokUserData() {
  return path.join(app.getPath("appData"), "grok");
}

function officialXcomLevelDbPath() {
  return path.join(
    officialGrokUserData(),
    "IndexedDB",
    OFFICIAL_IDB_DIR_NAME
  );
}

function dirSizeBytes(dir) {
  if (!dir || !fs.existsSync(dir)) return 0;
  let total = 0;
  /** @type {string[]} */
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      const full = path.join(cur, ent.name);
      try {
        if (ent.isDirectory()) stack.push(full);
        else if (ent.isFile()) total += fs.statSync(full).size;
      } catch {
        /* locked / race */
      }
    }
  }
  return total;
}

function formatBytes(n) {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(2)} GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${n} B`;
}

function listIndexedDbOrigins(userDataRoot) {
  const idbRoot = path.join(userDataRoot, "IndexedDB");
  if (!fs.existsSync(idbRoot)) return [];
  /** @type {{ name: string, path: string, bytes: number, walBytes: number, corruptHint: boolean }[]} */
  const out = [];
  let dirs = [];
  try {
    dirs = fs.readdirSync(idbRoot, { withFileTypes: true }).filter((d) => d.isDirectory());
  } catch {
    return [];
  }
  for (const d of dirs) {
    const full = path.join(idbRoot, d.name);
    const bytes = dirSizeBytes(full);
    let walBytes = 0;
    let corruptHint = false;
    try {
      for (const f of fs.readdirSync(full)) {
        const fp = path.join(full, f);
        try {
          const st = fs.statSync(fp);
          if (f.endsWith(".log")) walBytes += st.size;
          // Chromium LevelDB leaves CURRENT / LOCK / LOG; missing CURRENT often = corrupt
          if (f === "LOG" && st.size > 50 * 1024 * 1024) corruptHint = true;
        } catch {
          /* ignore */
        }
      }
      if (!fs.existsSync(path.join(full, "CURRENT")) && bytes > 0) corruptHint = true;
    } catch {
      corruptHint = true;
    }
    out.push({ name: d.name, path: full, bytes, walBytes, corruptHint });
  }
  return out;
}

/**
 * Recursively remove a directory (best-effort, handles Windows locks).
 * @returns {{ ok: boolean, path: string, freedBytes: number, error?: string }}
 */
function removeDirSafe(target) {
  if (!target || !fs.existsSync(target)) {
    return { ok: true, path: target, freedBytes: 0 };
  }
  const freedBytes = dirSizeBytes(target);
  try {
    fs.rmSync(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    return { ok: !fs.existsSync(target), path: target, freedBytes };
  } catch (err) {
    return {
      ok: false,
      path: target,
      freedBytes: 0,
      error: String(err.message || err),
    };
  }
}

/**
 * Flush Chromium persistent storage so LevelDB WAL can be compacted/closed.
 * Call on will-quit / before-quit.
 */
async function flushAllSessions() {
  const sessions = new Set([session.defaultSession]);
  try {
    // Persist any in-memory cookie/localStorage/IDB buffers to disk, then allow
    // Chromium to close LevelDB handles cleanly on process exit.
    for (const s of sessions) {
      await s.flushStorageData();
    }
  } catch (err) {
    console.warn("[storage-hygiene] flushStorageData failed:", err.message || err);
  }
}

/**
 * Clear IndexedDB for a web origin via Chromium session API.
 * Prefer this when the origin is loaded inside *this* Electron app.
 */
async function clearOriginIndexedDb(origin, ses = session.defaultSession) {
  try {
    await ses.clearStorageData({
      origin,
      storages: ["indexdb", "cachestorage", "serviceworkers"],
    });
    return { ok: true, origin };
  } catch (err) {
    return { ok: false, origin, error: String(err.message || err) };
  }
}

/**
 * Purge official Grok Desktop x.com LevelDB on disk (external app data).
 * Safe only when grok.exe is not holding file locks.
 */
function purgeOfficialXcomIndexedDb() {
  const target = officialXcomLevelDbPath();
  const result = removeDirSafe(target);
  // Also purge any alternate x.com partitions under same IndexedDB root
  const idbRoot = path.join(officialGrokUserData(), "IndexedDB");
  /** @type {ReturnType<typeof removeDirSafe>[]} */
  const extras = [];
  if (fs.existsSync(idbRoot)) {
    try {
      for (const d of fs.readdirSync(idbRoot, { withFileTypes: true })) {
        if (!d.isDirectory()) continue;
        if (!/x\.com/i.test(d.name)) continue;
        const full = path.join(idbRoot, d.name);
        if (full === target) continue;
        extras.push(removeDirSafe(full));
      }
    } catch {
      /* ignore */
    }
  }
  return {
    target,
    primary: result,
    extras,
    freedBytes:
      (result.freedBytes || 0) + extras.reduce((a, e) => a + (e.freedBytes || 0), 0),
  };
}

/**
 * Scan this app's userData + optional official grok path; purge oversized/corrupt IDB.
 * @param {{ includeOfficialGrok?: boolean, forceOfficial?: boolean }} opts
 */
async function runHygienePass(opts = {}) {
  const includeOfficialGrok = opts.includeOfficialGrok !== false;
  const forceOfficial = Boolean(opts.forceOfficial);
  /** @type {any[]} */
  const actions = [];
  let freedBytes = 0;

  // 1) Our Electron userData IndexedDB (should stay tiny; still protect)
  const ownOrigins = listIndexedDbOrigins(app.getPath("userData"));
  for (const origin of ownOrigins) {
    const over =
      origin.bytes >= PURGE_BYTES ||
      origin.walBytes >= PURGE_BYTES ||
      origin.corruptHint ||
      origin.bytes >= EMERGENCY_BYTES;
    if (!over) {
      if (origin.bytes >= WARN_BYTES) {
        actions.push({
          action: "warn",
          scope: "app",
          ...origin,
          size: formatBytes(origin.bytes),
        });
      }
      continue;
    }
    // Try Chromium clear first when name maps to https origin
    // Folder form: https_x.com_0.indexeddb.leveldb  OR  https_example_com_0.indexeddb.leveldb
    const httpsMatch = origin.name.match(
      /^(https?)_([a-z0-9._-]+)_\d+\.indexeddb\.leveldb$/i
    );
    if (httpsMatch) {
      const scheme = httpsMatch[1].toLowerCase();
      let host = httpsMatch[2];
      // If host has no dots, Chromium may have used _ as dot separators
      if (!host.includes(".")) host = host.replace(/_/g, ".");
      const originUrl = `${scheme}://${host}`;
      const cleared = await clearOriginIndexedDb(originUrl);
      actions.push({ action: "clearStorageData", scope: "app", origin: originUrl, ...cleared });
    }
    const removed = removeDirSafe(origin.path);
    freedBytes += removed.freedBytes || 0;
    actions.push({
      action: "rebuild",
      scope: "app",
      reason:
        origin.corruptHint
          ? "corrupt"
          : origin.walBytes >= PURGE_BYTES
            ? "wal-oversize"
            : "folder-oversize",
      sizeBefore: formatBytes(origin.bytes),
      ...removed,
    });
  }

  // 2) Official Grok Desktop x.com balloon (external)
  if (includeOfficialGrok) {
    const officialPath = officialXcomLevelDbPath();
    const officialBytes = dirSizeBytes(officialPath);
    const officialOrigins = listIndexedDbOrigins(officialGrokUserData()).filter((o) =>
      /x\.com/i.test(o.name)
    );
    const shouldPurge =
      forceOfficial ||
      officialBytes >= PURGE_BYTES ||
      officialOrigins.some(
        (o) => o.corruptHint || o.walBytes >= PURGE_BYTES || o.bytes >= PURGE_BYTES
      );

    if (shouldPurge && (officialBytes > 0 || officialOrigins.length)) {
      const purged = purgeOfficialXcomIndexedDb();
      freedBytes += purged.freedBytes || 0;
      actions.push({
        action: "purge-official-xcom",
        scope: "official-grok",
        sizeBefore: formatBytes(officialBytes),
        ...purged,
        sizeAfter: formatBytes(dirSizeBytes(officialPath)),
      });
    } else if (officialBytes >= WARN_BYTES) {
      actions.push({
        action: "warn",
        scope: "official-grok",
        path: officialPath,
        bytes: officialBytes,
        size: formatBytes(officialBytes),
      });
    }
  }

  return {
    ok: true,
    at: new Date().toISOString(),
    thresholds: {
      warn: formatBytes(WARN_BYTES),
      purge: formatBytes(PURGE_BYTES),
      emergency: formatBytes(EMERGENCY_BYTES),
    },
    freedBytes,
    freed: formatBytes(freedBytes),
    actions,
    appUserData: app.getPath("userData"),
    officialUserData: officialGrokUserData(),
  };
}

function getStorageReport() {
  const appOrigins = listIndexedDbOrigins(app.getPath("userData"));
  const officialOrigins = listIndexedDbOrigins(officialGrokUserData());
  const officialXcom = officialXcomLevelDbPath();
  const officialXcomBytes = dirSizeBytes(officialXcom);

  return {
    at: new Date().toISOString(),
    thresholds: {
      warnBytes: WARN_BYTES,
      purgeBytes: PURGE_BYTES,
      emergencyBytes: EMERGENCY_BYTES,
      warn: formatBytes(WARN_BYTES),
      purge: formatBytes(PURGE_BYTES),
    },
    app: {
      userData: app.getPath("userData"),
      userDataBytes: dirSizeBytes(app.getPath("userData")),
      userDataSize: formatBytes(dirSizeBytes(app.getPath("userData"))),
      indexedDbOrigins: appOrigins.map((o) => ({
        ...o,
        size: formatBytes(o.bytes),
        walSize: formatBytes(o.walBytes),
        needsPurge:
          o.bytes >= PURGE_BYTES || o.walBytes >= PURGE_BYTES || o.corruptHint,
      })),
    },
    officialGrok: {
      userData: officialGrokUserData(),
      xcomLevelDb: officialXcom,
      xcomBytes: officialXcomBytes,
      xcomSize: formatBytes(officialXcomBytes),
      needsPurge:
        officialXcomBytes >= PURGE_BYTES ||
        officialOrigins.some(
          (o) => /x\.com/i.test(o.name) && (o.corruptHint || o.bytes >= PURGE_BYTES)
        ),
      indexedDbOrigins: officialOrigins.map((o) => ({
        ...o,
        size: formatBytes(o.bytes),
        walSize: formatBytes(o.walBytes),
        needsPurge:
          o.bytes >= PURGE_BYTES || o.walBytes >= PURGE_BYTES || o.corruptHint,
      })),
    },
  };
}

/**
 * Startup hook: purge emergency bloat before any BrowserWindow opens.
 */
async function hygieneOnStartup() {
  const report = getStorageReport();
  const emergency =
    report.officialGrok.xcomBytes >= EMERGENCY_BYTES ||
    report.app.indexedDbOrigins.some((o) => o.bytes >= EMERGENCY_BYTES);

  if (emergency || report.officialGrok.needsPurge) {
    console.warn(
      "[storage-hygiene] oversized/corrupt IndexedDB detected — running purge pass"
    );
    return runHygienePass({ includeOfficialGrok: true, forceOfficial: emergency });
  }

  // Soft pass: only rebuild corrupt / over-threshold app origins
  const soft = await runHygienePass({ includeOfficialGrok: false });
  return { ...soft, skippedOfficial: true, report };
}

/**
 * Orderly shutdown: flush Chromium storage so LevelDB WAL is not left mid-write.
 * There is no public compactRange(); flush + process exit is the supported path.
 */
async function hygieneOnWillQuit() {
  await flushAllSessions();
  // Give Chromium a brief moment to release LevelDB locks after flush
  await new Promise((r) => setTimeout(r, 50));
}

module.exports = {
  WARN_BYTES,
  PURGE_BYTES,
  EMERGENCY_BYTES,
  OFFICIAL_XCOM_ORIGIN,
  officialGrokUserData,
  officialXcomLevelDbPath,
  dirSizeBytes,
  formatBytes,
  listIndexedDbOrigins,
  removeDirSafe,
  flushAllSessions,
  clearOriginIndexedDb,
  purgeOfficialXcomIndexedDb,
  runHygienePass,
  getStorageReport,
  hygieneOnStartup,
  hygieneOnWillQuit,
};
