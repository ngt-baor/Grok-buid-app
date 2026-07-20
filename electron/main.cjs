const { app, BrowserWindow, dialog, ipcMain, clipboard, shell, Menu } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { spawn } = require("node:child_process");
const {
  getAppIcon,
  ensurePngOnDisk,
  ensureBrandLogoPngs,
  resolveDockIconPath,
} = require("./icon-png.cjs");

/** Display name in menu / about / window (not "Electron"). */
const APP_DISPLAY_NAME = "Grok Build App";
const { installAppMenu, popupMenuAt, setMenuLocale } = require("./menu.cjs");
const {
  loadSettings,
  saveSettings,
  rememberProject,
  modelForProject,
  setModelForProject,
  buildPersonalizationPrefix,
  setStandalonePathCheck,
} = require("./settings.cjs");
const {
  buildMcpServers,
  mcpServerNames,
  describeMcpServers,
} = require("./mcp-servers.cjs");
const {
  detectHarness,
  readRunbookIndex,
  searchRunbooks,
  postTaskChecklist,
} = require("./harness.cjs");
const {
  authStatus,
  startLoginCli,
  startDeviceLogin,
  cancelDeviceLogin,
  logout,
} = require("./auth.cjs");
const { AcpBridge } = require("./acp-bridge.cjs");
const {
  fetchModels,
  getUsageSnapshot,
  recordInferenceUsage,
  setContextWindow,
  getContextSnapshot,
  beginTurnUsage,
  consumeTurnUsage,
  extractUsageFromPayload,
  setLatestInferenceLoader,
} = require("./usage.cjs");
const {
  getProfileStats,
  recordTurnActivity,
  tokensSince,
  latestInferenceFromLog,
  emptyProfileStats,
} = require("./profile-stats.cjs");

// Context chip fallback: when ACP never streams usage, read last inference from CLI logs.
setLatestInferenceLoader(latestInferenceFromLog);
const {
  listMemories,
  addMemory,
  removeMemory,
  clearMemories,
  formatMemoriesForPrompt,
  maybeAutoMemoryFromTurn,
} = require("./memory.cjs");
const { listSkills } = require("./skills.cjs");
const {
  loadProjectSession,
  loadStore,
  renameProjectSession,
  saveActiveTab,
  saveTab,
  createTab,
  switchTab,
  closeTab,
  listProjectSessions,
  getStandalonePath,
  isStandalonePath,
} = require("./sessions.cjs");

// Wire standalone filter so rememberProject never lists chat-không-project.
setStandalonePathCheck(isStandalonePath);
const { listDir, readFileSafe, lineDiff } = require("./files.cjs");
const { getGitInfo, listWorktrees, getGitStatus } = require("./git.cjs");
const {
  hygieneOnStartup,
  hygieneOnWillQuit,
  getStorageReport,
  runHygienePass,
  purgeOfficialXcomIndexedDb,
  flushAllSessions,
} = require("./storage-hygiene.cjs");
const {
  getAppVersionInfo,
  resolveGithubRepo,
  checkForUpdates,
  downloadUpdate,
  cancelDownload,
  applyUpdate,
} = require("./updater.cjs");
const {
  getCliStatus,
  installCli,
  cancelCliInstall,
} = require("./cli-install.cjs");
const { resolveGrokBinary } = require("./platform/paths.cjs");
const {
  openExternalTerminal,
  terminalOptions,
} = require("./platform/terminal.cjs");

// Stable userData name — never share Chromium profile with official Grok Desktop (%APPDATA%\grok)
try {
  const want = "grok-build-app";
  if (!app.getPath("userData").toLowerCase().includes(want)) {
    app.setPath("userData", path.join(app.getPath("appData"), want));
  }
} catch {
  /* before ready: setPath is allowed; ignore if already locked */
}

// Name shown in menu bar / about (dev + prod). Packaged Mac also uses productName in Info.plist.
try {
  app.setName(APP_DISPLAY_NAME);
} catch {
  /* ignore */
}

// Classic (non-overlay) scrollbars so ::-webkit-scrollbar CSS actually paints on Windows.
// Overlay path often ignores custom thumb/track and keeps OS-looking bars.
try {
  app.commandLine.appendSwitch(
    "disable-features",
    "OverlayScrollbar,OverlayScrollbarFlashAfterAnyScrollUpdate,OverlayScrollbarFlashWhenMouseEnter"
  );
} catch {
  /* ignore */
}

// Second launch while first is running: Chromium userData lock often makes the new
// process flash a process entry then exit (looks like "mở ra tắt luôn").
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
  // Avoid running the rest of the main process.
  process.exit(0);
}

/** @type {BrowserWindow | null} */
let mainWindow = null;
/** @type {Electron.Menu | null} */
let appMenu = null;
/** @type {AcpBridge | null} */
let bridge = null;
/** @type {Map<number, { respond: Function, deny: Function }>} */
const pendingPermissions = new Map();
/** @type {string} */
let activeProject = "";
/** @type {ReturnType<typeof setInterval> | null} */
let usageTimer = null;
/** @type {ReturnType<typeof setInterval> | null} */
let storageTimer = null;
/** @type {any[]} */
let recentDiffs = [];
/** Prevent double async quit work */
let quitting = false;

function isDev() {
  return Boolean(process.env.VITE_DEV_SERVER_URL);
}

/**
 * Prepend personalization text to a prompt payload without dropping attachments.
 * @param {string | Array | { text?: string, images?: any[], files?: any[] }} payload
 * @param {string} prefix
 */
function prependPromptPrefix(payload, prefix) {
  if (!prefix) return payload;
  if (typeof payload === "string") {
    return prefix + payload;
  }
  if (Array.isArray(payload)) {
    return [{ type: "text", text: prefix }, ...payload];
  }
  if (payload && typeof payload === "object") {
    const text = typeof payload.text === "string" ? payload.text : "";
    return { ...payload, text: prefix + text };
  }
  return payload;
}

/**
 * Keep Menu.setApplicationMenu for accelerators + popupMenuAt, but never show
 * the native window menu bar on Win/Linux (custom .app-titlebar owns labels).
 * Note: do not win.setMenu(null) — that drops accelerators on Windows.
 * Also do not win.setMenu(appMenu) — attaching the menu re-shows the chrome bar.
 * @param {BrowserWindow | null} win
 */
function hideNativeMenuBar(win) {
  if (!win || win.isDestroyed()) return;
  try {
    win.setAutoHideMenuBar(true);
    win.setMenuBarVisibility(false);
  } catch {
    /* ignore */
  }
}

const TITLEBAR_HEIGHT = 32;

/** Colors for custom titlebar + Win titleBarOverlay (must match .app-titlebar). */
function chromeThemeColors(theme) {
  const light = theme === "light";
  return {
    color: light ? "#f4f4f5" : "#171717",
    symbolColor: light ? "#3f3f46" : "#c5c5c5",
  };
}

/**
 * Sync Electron window chrome with renderer light/dark theme.
 * Without this, Win caption strip stays dark while UI goes light (washed controls).
 * @param {string} [theme]
 */
function applyChromeTheme(theme) {
  const t = theme === "light" ? "light" : "dark";
  const { color, symbolColor } = chromeThemeColors(t);
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    mainWindow.setBackgroundColor(color);
  } catch {
    /* ignore */
  }
  if (
    process.platform === "win32" &&
    typeof mainWindow.setTitleBarOverlay === "function"
  ) {
    try {
      mainWindow.setTitleBarOverlay({
        color,
        symbolColor,
        height: TITLEBAR_HEIGHT,
      });
    } catch {
      /* ignore — older Electron */
    }
  }
}

function applyAppBranding() {
  try {
    app.setName(APP_DISPLAY_NAME);
  } catch {
    /* ignore */
  }
  try {
    if (typeof app.setAppUserModelId === "function") {
      app.setAppUserModelId("com.ngtbaor.grokbuild");
    }
  } catch {
    /* ignore */
  }
  try {
    app.setAboutPanelOptions({
      applicationName: APP_DISPLAY_NAME,
      applicationVersion: app.getVersion(),
      copyright: "Copyright © ngt-baor",
    });
  } catch {
    /* ignore */
  }

  // macOS Dock: BrowserWindow.icon is ignored; must use dock.setIcon (PNG/ICNS path).
  // Dev Dock *label* comes from Electron.app Info.plist — patched by scripts/brand-electron-dev.cjs.
  if (process.platform === "darwin" && app.dock) {
    try {
      ensurePngOnDisk();
    } catch {
      /* ignore */
    }
    const dockPath = resolveDockIconPath();
    if (dockPath) {
      try {
        app.dock.setIcon(dockPath);
      } catch {
        try {
          const img = getAppIcon({ preferRaster: true });
          if (img && !img.isEmpty()) app.dock.setIcon(img);
        } catch {
          /* ignore */
        }
      }
    }
  }
}

function createWindow() {
  applyAppBranding();

  // Raster first for taskbar/Dock quality (same brand mark as Windows).
  const icon = getAppIcon({ preferRaster: true });
  try {
    ensurePngOnDisk();
  } catch {
    /* ignore */
  }
  try {
    ensureBrandLogoPngs();
  } catch {
    /* ignore */
  }

  // Hybrid titlebar (PA3):
  //  - Windows: titleBarStyle hidden + titleBarOverlay caption buttons only
  //  - macOS: hiddenInset traffic lights
  //  - Native window menu bar OFF (no double bar)
  //  - Menu.setApplicationMenu keeps accelerators; renderer labels popup via popupMenuAt
  const isMac = process.platform === "darwin";
  const isWin = process.platform === "win32";
  let bootTheme = "dark";
  try {
    bootTheme = loadSettings()?.theme === "light" ? "light" : "dark";
  } catch {
    /* ignore */
  }
  const { color: titlebarColor, symbolColor: titlebarSymbol } =
    chromeThemeColors(bootTheme);

  /** @type {Electron.BrowserWindowConstructorOptions} */
  const winOpts = {
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 720,
    title: APP_DISPLAY_NAME,
    backgroundColor: titlebarColor,
    show: false,
    frame: true,
    autoHideMenuBar: true,
    icon: icon && typeof icon !== "string" && !icon.isEmpty?.() ? icon : icon || undefined,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  };

  if (isMac) {
    winOpts.titleBarStyle = "hiddenInset";
    winOpts.trafficLightPosition = { x: 12, y: 10 };
  } else if (isWin) {
    winOpts.titleBarStyle = "hidden";
    winOpts.icon =
      path.join(__dirname, "..", "assets", "icon.ico");
    winOpts.titleBarOverlay = {
      color: titlebarColor,
      symbolColor: titlebarSymbol,
      height: TITLEBAR_HEIGHT,
    };
  }

  mainWindow = new BrowserWindow(winOpts);

  // data:/blob: top-level navigation (e.g. <a target=_blank href="data:image/...">)
  // opens a blank white Grok Build window on Windows. Deny those; allow real http(s).
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const u = String(url || "");
    if (/^https?:\/\//i.test(u)) {
      void shell.openExternal(u);
    }
    return { action: "deny" };
  });

  // Application menu stays global (installAppMenu) for accelerators + popupMenuAt.
  // Do NOT mainWindow.setMenu(menu) on Win/Linux — that re-shows the native bar
  // under the custom titlebar (double Tệp / Chỉnh sửa / …).
  hideNativeMenuBar(mainWindow);

  if (icon && typeof icon !== "string" && !icon.isEmpty?.()) {
    try {
      mainWindow.setIcon(icon);
    } catch {
      /* ignore */
    }
  }
  // Re-apply Dock icon after window exists (some Electron builds reset on create).
  if (isMac && app.dock) {
    try {
      const dockPath = resolveDockIconPath();
      if (dockPath) app.dock.setIcon(dockPath);
    } catch {
      /* ignore */
    }
  }

  mainWindow.once("ready-to-show", () => {
    // Some Electron builds re-expose the menu after load; re-hide before show.
    hideNativeMenuBar(mainWindow);
    mainWindow?.show();
  });

  // Fallback: never stay forever on a hidden window if ready-to-show is delayed
  setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      hideNativeMenuBar(mainWindow);
      mainWindow.show();
    }
  }, 2500);

  mainWindow.webContents.on("did-fail-load", (_e, code, desc, url) => {
    console.error("[window] did-fail-load", { code, desc, url });
  });
  mainWindow.webContents.on("render-process-gone", (_e, details) => {
    console.error("[window] render-process-gone", details);
  });
  mainWindow.webContents.on("console-message", (_e, level, message, line, sourceId) => {
    if (level >= 2) {
      console.error("[renderer]", message, sourceId ? `(${sourceId}:${line})` : "");
    }
  });

  if (isDev()) {
    const devUrl = process.env.VITE_DEV_SERVER_URL || "http://127.0.0.1:5173";
    mainWindow.loadURL(devUrl).catch((err) => {
      console.error("[window] loadURL failed", err);
    });
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function send(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

function wireBridge(instance) {
  instance.on("status", (d) => send("agent:status", d));
  instance.on("stderr", (t) => send("agent:stderr", t));
  instance.on("error", (err) => send("agent:error", { message: String(err.message || err) }));
  instance.on("exit", (d) => send("agent:exit", d));
  instance.on("session", (d) => send("agent:session", d));
  // Throttle usage:context during token stream — every chunk was re-rendering the whole UI.
  let lastUsageCtxSent = 0;
  instance.on("update", (d) => {
    send("agent:update", d);
    const kind =
      d?.update?.sessionUpdate ||
      d?.update?.type ||
      d?.sessionUpdate ||
      "";
    // Skip usage extraction on pure text chunks (hottest path).
    if (
      kind === "agent_message_chunk" ||
      kind === "agent_thought_chunk" ||
      kind === "agent_message" ||
      kind === "agent_thought" ||
      kind === "message" ||
      kind === "thought"
    ) {
      return;
    }
    const usage =
      extractUsageFromPayload(d?.update) ||
      extractUsageFromPayload(d) ||
      extractUsageFromPayload(d?.raw);
    if (!usage) return;
    const now = Date.now();
    if (now - lastUsageCtxSent < 400) return;
    lastUsageCtxSent = now;
    const snap = recordInferenceUsage(usage);
    send("usage:context", snap);
  });
  instance.on("notification", (d) => {
    send("agent:notification", d);
    // x.ai session notifications may include usage/diff
    if (d?.method?.includes("session") && d?.params) {
      send("agent:session-meta", d.params);
    }
  });
  instance.on("permission", (req) => {
    pendingPermissions.set(req.id, { respond: req.respond, deny: req.deny });
    send("agent:permission", { id: req.id, params: req.params });
  });
  instance.on("diff", (payload) => {
    const diff = lineDiff(payload.before, payload.after, payload.path);
    recentDiffs = [{ ...diff, at: new Date().toISOString() }, ...recentDiffs].slice(0, 30);
    send("diff:new", recentDiffs[0]);
  });
}

async function refreshUsageBroadcast() {
  try {
    const snapshot = await getUsageSnapshot();
    send("usage:update", snapshot);
    return snapshot;
  } catch (err) {
    const snapshot = {
      weeklyQuota: null,
      fiveHour: null,
      week: null,
      credits: null,
      context: null,
      errors: { fatal: String(err.message || err) },
      fetchedAt: new Date().toISOString(),
    };
    send("usage:update", snapshot);
    return snapshot;
  }
}

function startUsagePolling() {
  if (usageTimer) clearInterval(usageTimer);
  void refreshUsageBroadcast();
  usageTimer = setInterval(() => void refreshUsageBroadcast(), 45_000);
}

function startStorageHygienePolling() {
  if (storageTimer) clearInterval(storageTimer);
  // Periodic LevelDB size check (~10 min). Auto-rebuild if over threshold / corrupt.
  storageTimer = setInterval(() => {
    void (async () => {
      try {
        const report = getStorageReport();
        send("storage:report", report);
        if (report.officialGrok?.needsPurge || report.app?.indexedDbOrigins?.some((o) => o.needsPurge)) {
          const result = await runHygienePass({ includeOfficialGrok: true });
          send("storage:hygiene", result);
          if (result.freedBytes > 0) {
            send("agent:notification", {
              method: "storage/hygiene",
              params: {
                message: `Đã dọn IndexedDB bloated (~${result.freed}).`,
                ...result,
              },
            });
          }
        }
      } catch (err) {
        console.warn("[storage-hygiene] poll failed:", err.message || err);
      }
    })();
  }, 10 * 60_000);
}

async function shutdownClean() {
  if (quitting) return;
  quitting = true;
  try {
    if (usageTimer) {
      clearInterval(usageTimer);
      usageTimer = null;
    }
    if (storageTimer) {
      clearInterval(storageTimer);
      storageTimer = null;
    }
    bridge?.stop();
    bridge = null;
    // Flush Chromium IDB/LevelDB buffers so WAL is not left open mid-write
    await hygieneOnWillQuit();
  } catch (err) {
    console.warn("[shutdown]", err.message || err);
  }
}

function projectBundle(projectPath) {
  const resolved = path.resolve(projectPath);
  const settings = loadSettings();
  const model = modelForProject(resolved);
  const { store, tab } = loadProjectSession(resolved);
  // ensure model on tab
  if (!tab.model) tab.model = model;
  return {
    path: resolved,
    harness: detectHarness(resolved),
    settings,
    model: tab.model || model,
    reasoningEffort: tab.reasoningEffort || settings.reasoningEffort || "high",
    store,
    tab,
    chat: { items: tab.items || [] },
  };
}

function sameProjectPath(a, b) {
  if (!a || !b) return false;
  return path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
}

function remapProjectPathRecord(record, oldPath, newPath) {
  const next = { ...(record || {}) };
  const oldKey = Object.keys(next).find((key) => sameProjectPath(key, oldPath));
  if (oldKey) {
    next[newPath] = next[oldKey];
    delete next[oldKey];
  }
  return next;
}

function registerIpc() {
  // Custom titlebar menu popup (compact bar → native submenu)
  ipcMain.handle("menu:popup", (event, payload = {}) => {
    const key = String(payload.key || payload.menu || "");
    const win = BrowserWindow.fromWebContents(event.sender);
    return {
      ok: popupMenuAt(key, {
        window: win,
        x: payload.x,
        y: payload.y,
      }),
    };
  });

  ipcMain.handle("settings:get", () => loadSettings());
  ipcMain.handle("settings:save", (_e, partial) => {
    const next = saveSettings(partial || {});
    // Rebuild native menu labels when UI language changes
    try {
      if (next?.locale) setMenuLocale(next.locale);
    } catch {
      /* ignore */
    }
    // Keep Win caption strip / window bg in sync when theme is saved
    try {
      if (partial && Object.prototype.hasOwnProperty.call(partial, "theme")) {
        applyChromeTheme(next?.theme);
      }
    } catch {
      /* ignore */
    }
    return next;
  });
  /** Sync Electron titleBarOverlay + backgroundColor with renderer theme. */
  ipcMain.handle("window:set-chrome-theme", (_e, theme) => {
    applyChromeTheme(theme);
    return { ok: true };
  });
  ipcMain.handle("auth:status", () => authStatus());

  // ── App version + GitHub Releases updater ───────────────────
  ipcMain.handle("app:get-version", () => {
    const info = getAppVersionInfo();
    const settings = loadSettings();
    return {
      ...info,
      updateGithubRepo: settings.updateGithubRepo || "",
      resolvedRepo: resolveGithubRepo(settings),
    };
  });
  ipcMain.handle("update:check", async () => {
    try {
      return await checkForUpdates(loadSettings());
    } catch (err) {
      const info = getAppVersionInfo();
      return {
        ok: false,
        status: "error",
        currentVersion: info.version,
        latestVersion: null,
        updateAvailable: false,
        message: String(err?.message || err),
        releaseUrl: null,
        asset: null,
        body: null,
        publishedAt: null,
        repo: null,
      };
    }
  });
  ipcMain.handle("update:download", async (event, asset) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const sendProgress = (payload) => {
      try {
        if (win && !win.isDestroyed()) win.webContents.send("update:progress", payload);
        else send("update:progress", payload);
      } catch {
        /* ignore */
      }
    };
    try {
      return await downloadUpdate(asset || {}, sendProgress);
    } catch (err) {
      const cancelled = Boolean(err?.cancelled);
      sendProgress({
        phase: cancelled ? "cancelled" : "error",
        received: 0,
        total: 0,
        percent: 0,
        bytesPerSecond: 0,
        speedLabel: "—",
        error: String(err?.message || err),
      });
      return {
        ok: false,
        cancelled,
        error: String(err?.message || err),
      };
    }
  });
  ipcMain.handle("update:cancel", () => cancelDownload());
  ipcMain.handle("update:apply", async (_e, payload = {}) => {
    return applyUpdate(payload.path || payload.filePath || "", payload.mode || "open");
  });

  /** Grok CLI presence + in-app install (progress via cli:progress). */
  ipcMain.handle("cli:status", () => {
    const settings = loadSettings();
    return getCliStatus(settings.grokPath);
  });
  ipcMain.handle("cli:install", async (event, opts = {}) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const sendProgress = (payload) => {
      try {
        if (win && !win.isDestroyed()) win.webContents.send("cli:progress", payload);
        else send("cli:progress", payload);
      } catch {
        /* ignore */
      }
    };
    try {
      const result = await installCli(opts || {}, sendProgress);
      // Point settings at the installed binary so agent/login resolve correctly.
      if (result?.path) {
        try {
          saveSettings({ grokPath: result.path });
        } catch {
          /* ignore */
        }
      }
      return result;
    } catch (err) {
      const cancelled = Boolean(err?.cancelled);
      sendProgress({
        phase: cancelled ? "cancelled" : "error",
        received: 0,
        total: 0,
        percent: 0,
        bytesPerSecond: 0,
        speedLabel: "—",
        error: String(err?.message || err),
      });
      return {
        ok: false,
        cancelled,
        error: String(err?.message || err),
      };
    }
  });
  ipcMain.handle("cli:cancel", () => cancelCliInstall());

  /**
   * Primary login: OIDC device-code in-app (no terminal).
   * Progress via auth:login-progress { phase, userCode, verificationUri, … }.
   */
  ipcMain.handle("auth:login", async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const sendProgress = (payload) => {
      try {
        if (win && !win.isDestroyed()) win.webContents.send("auth:login-progress", payload);
        else send("auth:login-progress", payload);
      } catch {
        /* ignore */
      }
    };
    try {
      return await startDeviceLogin(sendProgress, { openBrowser: true });
    } catch (err) {
      const msg = String(err?.message || err);
      sendProgress({ phase: "error", error: msg });
      return { ok: false, mode: "device", error: msg };
    }
  });
  /** Fallback: open terminal `grok login`. */
  ipcMain.handle("auth:login-cli", () => {
    const settings = loadSettings();
    return startLoginCli(settings.grokPath);
  });
  ipcMain.handle("auth:login-cancel", () => cancelDeviceLogin());
  /** Delete ~/.grok/auth.json and return fresh status. */
  ipcMain.handle("auth:logout", () => logout());

  /** Codex-like profile analytics (tokens, heatmap, streaks, skills). */
  ipcMain.handle("profile:stats", async () => {
    try {
      return await getProfileStats();
    } catch (err) {
      // Always return a full year grid so the Hồ sơ UI never collapses empty
      console.warn("[main] profile:stats failed:", err?.message || err);
      return emptyProfileStats({ error: String(err?.message || err) });
    }
  });
  ipcMain.handle("profile:record-turn", (_e, payload) => {
    try {
      return recordTurnActivity(payload || {});
    } catch (err) {
      return { error: String(err.message || err) };
    }
  });

  /** App-level memories (personalization). */
  ipcMain.handle("memory:list", () => listMemories());
  ipcMain.handle("memory:add", (_e, payload) => addMemory(payload || {}));
  ipcMain.handle("memory:remove", (_e, id) => removeMemory(id));
  ipcMain.handle("memory:clear", () => clearMemories());
  /** Installed skills on disk (~/.grok, ~/.agents, project). */
  ipcMain.handle("skills:list", (_e, opts = {}) => {
    try {
      return listSkills({
        projectPath: opts?.projectPath || activeProject || null,
      });
    } catch (err) {
      return {
        ok: false,
        count: 0,
        uniqueCount: 0,
        skills: [],
        roots: [],
        projectPath: opts?.projectPath || activeProject || null,
        fetchedAt: new Date().toISOString(),
        error: String(err?.message || err),
      };
    }
  });
  ipcMain.handle("memory:auto-from-turn", (_e, payload) => {
    const settings = loadSettings();
    if (settings.memoryEnabled === false) return listMemories();
    if (payload?.usedTools && settings.memoryFromTools === false) {
      return listMemories();
    }
    try {
      return (
        maybeAutoMemoryFromTurn({
          summary: payload?.summary,
          usedTools: Boolean(payload?.usedTools),
          projectPath: payload?.projectPath || activeProject,
        }) || listMemories()
      );
    } catch {
      return listMemories();
    }
  });

  ipcMain.handle("models:list", async () => {
    try {
      const models = await fetchModels();
      return { ok: true, models };
    } catch (err) {
      return {
        ok: false,
        error: String(err.message || err),
        models: [
          {
            id: "grok-4.5",
            name: "Grok 4.5",
            supportsReasoningEffort: true,
            contextWindow: 500000,
            reasoningEfforts: [
              { id: "high", label: "High Effort", default: true },
              { id: "medium", label: "Medium Effort" },
              { id: "low", label: "Low Effort" },
            ],
          },
          { id: "grok-composer-2.5-fast", name: "Composer 2.5", contextWindow: 200000 },
        ],
      };
    }
  });

  ipcMain.handle("usage:get", async () => refreshUsageBroadcast());

  // IndexedDB / LevelDB WAL hygiene (official Grok x.com balloon + this app)
  ipcMain.handle("storage:report", () => getStorageReport());
  ipcMain.handle("storage:hygiene", async (_e, opts) => {
    const result = await runHygienePass(opts || { includeOfficialGrok: true });
    send("storage:hygiene", result);
    return result;
  });
  ipcMain.handle("storage:purge-official-xcom", () => {
    const result = purgeOfficialXcomIndexedDb();
    send("storage:hygiene", { action: "purge-official-xcom", ...result });
    return result;
  });
  ipcMain.handle("storage:flush", async () => {
    await flushAllSessions();
    return { ok: true };
  });

  ipcMain.handle("project:pick", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openDirectory"],
      title: "Chọn project folder",
    });
    if (result.canceled || !result.filePaths[0]) return null;
    rememberProject(result.filePaths[0]);
    activeProject = path.resolve(result.filePaths[0]);
    return projectBundle(result.filePaths[0]);
  });

  ipcMain.handle("project:open", (_e, projectPath) => {
    if (!projectPath || !fs.existsSync(projectPath)) {
      throw new Error("Project path không tồn tại");
    }
    // Opening the internal standalone path via openProject still works but
    // does not pollute recent (rememberProject filters it).
    rememberProject(projectPath);
    activeProject = path.resolve(projectPath);
    return projectBundle(projectPath);
  });

  /** Path of the internal workspace used for chat without a code project. */
  ipcMain.handle("standalone:path", () => getStandalonePath());

  /** Open / restore chat-không-project (not added to recent projects). */
  ipcMain.handle("standalone:open", () => {
    const p = getStandalonePath();
    saveSettings({ lastProject: path.resolve(p) });
    activeProject = path.resolve(p);
    return projectBundle(p);
  });

  /** Load standalone tab store without switching the active agent project. */
  ipcMain.handle("standalone:store", () => loadStore(getStandalonePath()));

  ipcMain.handle("standalone:is", (_e, projectPath) => isStandalonePath(projectPath));

  ipcMain.handle("project:list-sessions", () => listProjectSessions());

  // Tabs
  ipcMain.handle("tabs:create", (_e, { projectPath, model, reasoningEffort, title }) => {
    const store = createTab(projectPath, { model, reasoningEffort, title });
    return store;
  });
  ipcMain.handle("tabs:switch", (_e, { projectPath, tabId }) => switchTab(projectPath, tabId));
  ipcMain.handle("tabs:close", (_e, { projectPath, tabId }) => closeTab(projectPath, tabId));
  ipcMain.handle("tabs:save-active", (_e, { projectPath, patch }) =>
    saveActiveTab(projectPath, patch || {})
  );
  ipcMain.handle("tabs:save-tab", (_e, { projectPath, tabId, patch }) =>
    saveTab(projectPath, tabId, patch || {})
  );

  ipcMain.handle("chat:set-model", (_e, { projectPath, model }) => {
    if (!projectPath || !model) throw new Error("Thiếu projectPath/model");
    setModelForProject(projectPath, model);
    saveActiveTab(projectPath, { model });
    return { ok: true, model, settings: loadSettings() };
  });

  ipcMain.handle("chat:set-effort", (_e, { projectPath, reasoningEffort }) => {
    saveActiveTab(projectPath, { reasoningEffort });
    return { ok: true, reasoningEffort };
  });

  // Files
  ipcMain.handle("fs:tree", (_e, { projectPath, maxDepth }) => {
    if (!projectPath) return [];
    return listDir(projectPath, "", 0, maxDepth ?? 3);
  });
  ipcMain.handle("fs:read", (_e, { projectPath, filePath }) => {
    return readFileSafe(projectPath, filePath);
  });
  ipcMain.handle("diff:list", () => recentDiffs);
  ipcMain.handle("diff:clear", () => {
    recentDiffs = [];
    return { ok: true };
  });

  ipcMain.handle("harness:detect", (_e, projectPath) => detectHarness(projectPath));
  ipcMain.handle("harness:runbooks", (_e, projectPath) => readRunbookIndex(projectPath));
  ipcMain.handle("harness:search-runbooks", (_e, { projectPath, query }) =>
    searchRunbooks(projectPath, query || "")
  );
  ipcMain.handle("harness:checklist", (_e, projectPath) =>
    postTaskChecklist(detectHarness(projectPath || activeProject))
  );

  /** Best-effort git info for composer chips (Codex-like: Local + branch). */
  ipcMain.handle("git:info", async (_e, projectPath) => getGitInfo(projectPath || activeProject));
  ipcMain.handle("git:worktrees", async (_e, projectPath) =>
    listWorktrees(projectPath || activeProject)
  );
  ipcMain.handle("git:status", async (_e, projectPath) =>
    getGitStatus(projectPath || activeProject)
  );

  /** Open folder / file / URL in OS. */
  ipcMain.handle("shell:open-path", async (_e, targetPath) => {
    if (!targetPath || !fs.existsSync(targetPath)) {
      throw new Error("Path không tồn tại");
    }
    const err = await shell.openPath(path.resolve(targetPath));
    if (err) throw new Error(err);
    return { ok: true };
  });
  ipcMain.handle("shell:show-item", (_e, targetPath) => {
    if (!targetPath || !fs.existsSync(targetPath)) {
      throw new Error("Path không tồn tại");
    }
    shell.showItemInFolder(path.resolve(targetPath));
    return { ok: true };
  });
  ipcMain.handle("shell:open-external", async (_e, url) => {
    const u = String(url || "");
    if (!/^https?:\/\//i.test(u)) throw new Error("Chỉ cho phép http(s) URL");
    await shell.openExternal(u);
    return { ok: true };
  });

  /**
   * Open external terminal in project cwd (Windows / macOS / Linux).
   */
  ipcMain.handle("shell:open-terminal", async (_e, opts = {}) => {
    const cwd = path.resolve(opts.cwd || activeProject || process.cwd());
    if (!fs.existsSync(cwd)) throw new Error("cwd không tồn tại");
    const settings = loadSettings();
    const pref = opts.terminal || settings.terminal || "auto";
    return openExternalTerminal(cwd, pref);
  });

  /** Platform-specific terminal choices for Settings UI. */
  ipcMain.handle("shell:terminal-options", () => ({
    ok: true,
    platform: process.platform,
    options: terminalOptions(),
  }));

  /** Remove project from recent list */
  ipcMain.handle("project:remove-recent", (_e, projectPath) => {
    if (!projectPath) return loadSettings();
    const settings = loadSettings();
    const key = path.resolve(projectPath);
    const recentProjects = (settings.recentProjects || [])
      .filter((p) => path.resolve(p) !== key)
      .filter((p) => !isStandalonePath(p));
    const lastProject = settings.lastProject && path.resolve(settings.lastProject) === key
      ? recentProjects[0] || ""
      : settings.lastProject;
    return saveSettings({ recentProjects, lastProject });
  });

  ipcMain.handle("project:rename", (_e, { projectPath, newName } = {}) => {
    if (typeof projectPath !== "string" || !projectPath.trim()) {
      throw new Error("Thi\u1ebfu project path.");
    }
    const source = path.resolve(String(projectPath || ""));
    const name = String(newName || "").trim();
    if (!name || name === "." || name === "..") {
      throw new Error("\u0054\u00ean project kh\u00f4ng \u0111\u01b0\u1ee3c \u0111\u1ec3 tr\u1ed1ng.");
    }
    if (/^[. ]+$/.test(name) || /[<>:"/\\|?*\u0000-\u001f]/.test(name)) {
      throw new Error("\u0054\u00ean project ch\u1ee9a k\u00fd t\u1ef1 kh\u00f4ng h\u1ee3p l\u1ec7.");
    }
    if (name.length > 180) {
      throw new Error("\u0054\u00ean project qu\u00e1 d\u00e0i.");
    }
    if (!fs.existsSync(source) || !fs.statSync(source).isDirectory()) {
      throw new Error("Project path kh\u00f4ng t\u1ed3n t\u1ea1i ho\u1eb7c kh\u00f4ng ph\u1ea3i folder.");
    }

    const target = path.join(path.dirname(source), name);
    if (sameProjectPath(source, target)) return projectBundle(source);
    if (fs.existsSync(target)) {
      throw new Error(`Folder \u201c${name}\u201d \u0111\u00e3 t\u1ed3n t\u1ea1i trong th\u01b0 m\u1ee5c cha.`);
    }

    const sessionMove = renameProjectSession(source, target);
    let folderMoved = false;
    const rollback = () => {
      if (folderMoved) {
        try {
          fs.renameSync(target, source);
        } catch {
          /* best effort rollback; the original error remains user-visible */
        }
      }
      if (sessionMove.moved) {
        try {
          renameProjectSession(target, source);
        } catch {
          /* best effort rollback */
        }
      }
    };

    try {
      fs.renameSync(source, target);
      folderMoved = true;
      const settings = loadSettings();
      const recentProjects = (settings.recentProjects || []).map((p) =>
        sameProjectPath(p, source) ? target : p
      );
      const nextSettings = saveSettings({
        recentProjects,
        lastProject: sameProjectPath(settings.lastProject, source)
          ? target
          : settings.lastProject,
        projectModels: remapProjectPathRecord(settings.projectModels, source, target),
        projectEfforts: remapProjectPathRecord(settings.projectEfforts, source, target),
      });
      if (sameProjectPath(activeProject, source)) activeProject = target;
      // Keep the returned bundle authoritative for the renderer after a rename.
      const bundle = projectBundle(target);
      bundle.settings = nextSettings;
      return bundle;
    } catch (err) {
      rollback();
      throw err;
    }
  });

  ipcMain.handle("agent:start", async (_e, opts = {}) => {
    const settings = loadSettings();
    // Allow standalone workspace as cwd (chat without a real project folder).
    const cwd = opts.cwd || settings.lastProject || getStandalonePath();
    if (!cwd) throw new Error("Chưa chọn project (cwd).");
    // Ensure standalone sandbox exists when used as cwd.
    if (isStandalonePath(cwd)) {
      getStandalonePath();
    }

    const model = opts.model || modelForProject(cwd);
    const reasoningEffort = opts.reasoningEffort || settings.reasoningEffort || "high";
    const mcpServers = buildMcpServers(settings);
    const mcpNames = mcpServerNames(mcpServers);

    if (bridge) {
      bridge.stop();
      bridge = null;
    }

    activeProject = path.resolve(cwd);
    recentDiffs = [];
    const grokBinary = resolveGrokBinary(opts.grokPath || settings.grokPath);
    bridge = new AcpBridge({
      grokPath: grokBinary,
      cwd,
      model,
      reasoningEffort,
      alwaysApprove: Boolean(opts.alwaysApprove ?? settings.alwaysApprove),
      mcpServers,
    });
    wireBridge(bridge);

    // set context window from models list best-effort
    try {
      const models = await fetchModels();
      const m = models.find((x) => x.id === model);
      if (m?.contextWindow) setContextWindow(m.contextWindow);
    } catch {
      /* ignore */
    }

    try {
      const result = await bridge.start();
      saveActiveTab(cwd, { model, reasoningEffort });
      void refreshUsageBroadcast();
      return {
        ok: true,
        sessionId: result.sessionId,
        cwd,
        model,
        reasoningEffort,
        harness: detectHarness(cwd),
        mcpServers: mcpNames,
        mcpSummary: describeMcpServers(mcpServers, settings),
      };
    } catch (err) {
      const message = String(err.message || err);
      const stderr = bridge?.bufferStderr || "";
      bridge?.stop();
      bridge = null;
      throw new Error(message + (stderr ? `\n--- stderr ---\n${stderr.slice(-2000)}` : ""));
    }
  });

  /** Preview which MCP servers would be injected (for Settings UI). */
  ipcMain.handle("mcp:preview", () => {
    const settings = loadSettings();
    const servers = buildMcpServers(settings);
    return {
      ok: true,
      enabled: Boolean(settings.chromeDevtoolsMcp),
      servers: servers.map((s) => ({
        name: s.name,
        command: s.command,
        args: s.args,
      })),
      summary: describeMcpServers(servers, settings),
    };
  });

  ipcMain.handle("agent:stop", () => {
    bridge?.stop();
    bridge = null;
    pendingPermissions.clear();
    return { ok: true };
  });

  ipcMain.handle("agent:new-session", async (_e, cwd) => {
    if (!bridge) throw new Error("Agent chưa start");
    const sessionId = await bridge.newSession(cwd || activeProject);
    return { sessionId };
  });

  ipcMain.handle("agent:prompt", async (_e, payload) => {
    if (!bridge) throw new Error("Agent chưa start.");

    // Inject personality + custom instructions + memories (Codex-like personalization)
    const settings = loadSettings();
    let memoriesBlock = "";
    if (settings.memoryEnabled !== false) {
      try {
        memoriesBlock = formatMemoriesForPrompt(12);
      } catch {
        memoriesBlock = "";
      }
    }
    const prefix = buildPersonalizationPrefix(settings, { memoriesBlock });
    const personalized = prefix ? prependPromptPrefix(payload, prefix) : payload;

    const turnStartedAt = Date.now();
    beginTurnUsage();

    // string | { text?, images?, files? } | ContentBlock[]
    let result;
    try {
      result = await bridge.prompt(personalized);
    } catch (err) {
      // Still record whatever inference tokens we saw before failure
      const partial = consumeTurnUsage();
      if (partial.totalTokens > 0) {
        try {
          recordTurnActivity({
            tokens: partial.totalTokens,
            durationMs: Math.max(0, Date.now() - turnStartedAt),
            effort: settings.reasoningEffort || "",
            usedTools: false,
            at: turnStartedAt,
          });
        } catch {
          /* ignore */
        }
      }
      throw err;
    }

    // prompt result may include usage
    const resultUsage = extractUsageFromPayload(result) || result?.usage;
    if (resultUsage) {
      send("usage:context", recordInferenceUsage(resultUsage));
    }

    // Persist profile activity from multi-loop turn totals (main process — reliable).
    // If ACP never streamed usage, fall back to CLI unified.jsonl for this turn window.
    try {
      // Log can lag a beat after prompt resolves — short wait improves hit rate.
      await new Promise((r) => setTimeout(r, 250));
      const fromLog = tokensSince(turnStartedAt);

      // Context chip needs last prompt_tokens (window fill), not sum of burn.
      // ACP often omits usage on text chunks → hydrate from CLI log.
      const live = getContextSnapshot();
      if (!(live.promptTokens > 0) && fromLog.lastPromptTokens > 0) {
        send(
          "usage:context",
          recordInferenceUsage({
            promptTokens: fromLog.lastPromptTokens,
            completionTokens: fromLog.lastCompletionTokens,
            reasoningTokens: fromLog.lastReasoningTokens,
            cachedPromptTokens: fromLog.lastCachedPromptTokens,
          })
        );
      } else if (!(live.promptTokens > 0) && fromLog.peakPromptTokens > 0) {
        send(
          "usage:context",
          recordInferenceUsage({
            promptTokens: fromLog.peakPromptTokens,
            completionTokens: 0,
            reasoningTokens: 0,
            cachedPromptTokens: 0,
          })
        );
      }

      const turn = consumeTurnUsage();
      let tokens = turn.totalTokens || 0;
      let durationMs = Math.max(0, Date.now() - turnStartedAt);
      if (tokens <= 0) {
        tokens = fromLog.tokens || 0;
        if (fromLog.longestTaskMs > 0) {
          durationMs = Math.max(durationMs, fromLog.longestTaskMs);
        }
      }
      if (tokens > 0 || turn.inferences > 0) {
        recordTurnActivity({
          tokens,
          durationMs,
          effort: settings.reasoningEffort || "",
          usedTools: false,
          at: turnStartedAt,
        });
      }
      // Always push context snapshot after turn (chip + usage modal).
      send("usage:context", {
        ...getContextSnapshot(),
        turnTotalTokens: tokens || turn.totalTokens || 0,
      });
    } catch (err) {
      console.warn("[profile] record turn failed:", err?.message || err);
    }

    void refreshUsageBroadcast();
    return result;
  });

  /** Read image from OS clipboard (screenshots / copy image). */
  ipcMain.handle("clipboard:read-image", () => {
    try {
      const img = clipboard.readImage();
      if (!img || img.isEmpty()) return null;
      const png = img.toPNG();
      if (!png?.length) return null;
      return {
        mimeType: "image/png",
        data: png.toString("base64"),
        name: `clipboard-${Date.now()}.png`,
        size: png.length,
      };
    } catch (err) {
      throw new Error(String(err.message || err));
    }
  });

  /**
   * Read files from absolute paths (drag-drop from Explorer / paste file paths).
   * Images → base64; text → utf8; other binary → base64 blob.
   */
  ipcMain.handle("attachments:read-paths", (_e, filePaths = []) => {
    const MAX = 20 * 1024 * 1024; // 20MB
    const TEXT_EXT = new Set([
      ".txt", ".md", ".json", ".js", ".ts", ".tsx", ".jsx", ".css", ".html",
      ".xml", ".yml", ".yaml", ".toml", ".ini", ".csv", ".log", ".py", ".rs",
      ".go", ".java", ".c", ".cpp", ".h", ".cs", ".sh", ".ps1", ".sql",
      ".env", ".gitignore", ".dockerignore", ".vue", ".svelte", ".rb", ".php",
    ]);
    const IMAGE_EXT = new Set([
      ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg", ".ico",
    ]);
    const out = [];
    for (const p of filePaths) {
      if (!p || typeof p !== "string") continue;
      const abs = path.resolve(p);
      if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) continue;
      const stat = fs.statSync(abs);
      if (stat.size > MAX) {
        out.push({
          ok: false,
          path: abs,
          name: path.basename(abs),
          error: `File quá lớn (>${Math.round(MAX / 1024 / 1024)}MB)`,
        });
        continue;
      }
      const ext = path.extname(abs).toLowerCase();
      const name = path.basename(abs);
      try {
        if (IMAGE_EXT.has(ext)) {
          const buf = fs.readFileSync(abs);
          const mime =
            ext === ".jpg" || ext === ".jpeg"
              ? "image/jpeg"
              : ext === ".gif"
                ? "image/gif"
                : ext === ".webp"
                  ? "image/webp"
                  : ext === ".svg"
                    ? "image/svg+xml"
                    : "image/png";
          out.push({
            ok: true,
            kind: "image",
            path: abs,
            name,
            mimeType: mime,
            data: buf.toString("base64"),
            size: stat.size,
          });
        } else if (TEXT_EXT.has(ext) || stat.size < 512 * 1024) {
          // try utf8 text for small unknown files
          const text = fs.readFileSync(abs, "utf8");
          // Heuristic: if lots of nulls, treat as binary
          if (text.includes("\u0000")) {
            const buf = fs.readFileSync(abs);
            out.push({
              ok: true,
              kind: "file",
              path: abs,
              name,
              mimeType: "application/octet-stream",
              data: buf.toString("base64"),
              size: stat.size,
              isBinary: true,
            });
          } else {
            out.push({
              ok: true,
              kind: "file",
              path: abs,
              name,
              mimeType: "text/plain",
              text,
              size: stat.size,
              isBinary: false,
            });
          }
        } else {
          const buf = fs.readFileSync(abs);
          out.push({
            ok: true,
            kind: "file",
            path: abs,
            name,
            mimeType: "application/octet-stream",
            data: buf.toString("base64"),
            size: stat.size,
            isBinary: true,
          });
        }
      } catch (err) {
        out.push({
          ok: false,
          path: abs,
          name,
          error: String(err.message || err),
        });
      }
    }
    return out;
  });

  ipcMain.handle("attachments:pick-files", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openFile", "multiSelections"],
      title: "Chọn ảnh / file đính kèm",
      filters: [
        { name: "All supported", extensions: ["*"] },
        {
          name: "Images",
          extensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"],
        },
        {
          name: "Code / text",
          extensions: [
            "txt", "md", "json", "js", "ts", "tsx", "jsx", "css", "html",
            "py", "rs", "go", "java", "c", "cpp", "cs", "sql", "yml", "yaml",
          ],
        },
      ],
    });
    if (result.canceled || !result.filePaths?.length) return [];
    return result.filePaths;
  });

  ipcMain.handle("agent:cancel", () => {
    bridge?.cancel();
    return { ok: true };
  });

  ipcMain.handle("agent:permission-response", (_e, payload) => {
    const { id, allow, optionId } = payload || {};
    const entry = pendingPermissions.get(id);
    if (!entry) return { ok: false, reason: "unknown permission id" };
    pendingPermissions.delete(id);
    if (allow) entry.respond(optionId || "allow-once");
    else entry.deny();
    return { ok: true };
  });
}

function focusMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  hideNativeMenuBar(mainWindow);
  mainWindow.show();
  mainWindow.focus();
}

app.on("second-instance", () => {
  // User double-clicked again — bring existing window forward instead of flash-quit.
  focusMainWindow();
});

app.whenReady().then(async () => {
  // Windows taskbar / jump list identity
  try {
    app.setAppUserModelId("com.ngtbaor.grokbuild");
  } catch {
    /* ignore */
  }

  // Name + Dock/taskbar icon (must run after ready for dock.setIcon)
  applyAppBranding();

  // Menu labels follow settings.locale (vi default)
  let bootLocale = "vi";
  try {
    bootLocale = loadSettings()?.locale || "vi";
  } catch {
    /* ignore */
  }
  appMenu = installAppMenu(
    {
      onOpenProject: () => send("menu:open-project"),
      onSettings: () => send("menu:settings"),
      onUsage: () => send("menu:usage"),
      onNewChat: () => send("menu:new-chat"),
      onToggleRight: () => send("menu:toggle-right"),
      onTerminal: () => send("menu:terminal"),
    },
    bootLocale
  );

  // Purge emergency LevelDB bloat before windows open (handles corrupt WAL rebuild)
  try {
    const startup = await hygieneOnStartup();
    if (startup?.freedBytes > 0) {
      console.log("[storage-hygiene] startup freed", startup.freed, startup.actions);
    }
  } catch (err) {
    console.warn("[storage-hygiene] startup failed:", err.message || err);
  }

  registerIpc();
  createWindow();
  startUsagePolling();
  startStorageHygienePolling();
  // Broadcast initial storage health once UI is up
  setTimeout(() => {
    try {
      send("storage:report", getStorageReport());
    } catch {
      /* ignore */
    }
  }, 1500);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  void shutdownClean().finally(() => {
    if (process.platform !== "darwin") app.quit();
  });
});

// Orderly LevelDB close: flush storage on will-quit (Chromium has no compactRange API)
app.on("before-quit", (e) => {
  if (quitting) return;
  e.preventDefault();
  void shutdownClean().finally(() => app.exit(0));
});

app.on("will-quit", () => {
  // Last chance sync stop if before-quit path was skipped
  try {
    bridge?.stop();
  } catch {
    /* ignore */
  }
});
