const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("grokApp", {
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: (partial) => ipcRenderer.invoke("settings:save", partial),
  getAppVersion: () => ipcRenderer.invoke("app:get-version"),
  checkForUpdates: () => ipcRenderer.invoke("update:check"),
  downloadUpdate: (asset) => ipcRenderer.invoke("update:download", asset),
  cancelUpdateDownload: () => ipcRenderer.invoke("update:cancel"),
  applyUpdate: (payload) => ipcRenderer.invoke("update:apply", payload),
  /** Grok CLI: detect / install with in-app progress (no terminal window). */
  getCliStatus: () => ipcRenderer.invoke("cli:status"),
  installCli: (opts) => ipcRenderer.invoke("cli:install", opts || {}),
  cancelCliInstall: () => ipcRenderer.invoke("cli:cancel"),
  getAuth: () => ipcRenderer.invoke("auth:status"),
  /** In-app OIDC device-code login (progress on auth:login-progress). */
  login: () => ipcRenderer.invoke("auth:login"),
  /** Fallback: open terminal `grok login`. */
  loginCli: () => ipcRenderer.invoke("auth:login-cli"),
  cancelLogin: () => ipcRenderer.invoke("auth:login-cancel"),
  logout: () => ipcRenderer.invoke("auth:logout"),
  listModels: () => ipcRenderer.invoke("models:list"),
  getUsage: () => ipcRenderer.invoke("usage:get"),

  getProfileStats: () => ipcRenderer.invoke("profile:stats"),
  recordTurnActivity: (payload) => ipcRenderer.invoke("profile:record-turn", payload),

  listMemories: () => ipcRenderer.invoke("memory:list"),
  addMemory: (payload) => ipcRenderer.invoke("memory:add", payload),
  removeMemory: (id) => ipcRenderer.invoke("memory:remove", id),
  clearMemories: () => ipcRenderer.invoke("memory:clear"),
  autoMemoryFromTurn: (payload) => ipcRenderer.invoke("memory:auto-from-turn", payload),
  /** List installed skills from ~/.grok, ~/.agents, and optional project roots. */
  listSkills: (opts) => ipcRenderer.invoke("skills:list", opts || {}),

  getStorageReport: () => ipcRenderer.invoke("storage:report"),
  runStorageHygiene: (opts) => ipcRenderer.invoke("storage:hygiene", opts),
  purgeOfficialXcomIndexedDb: () => ipcRenderer.invoke("storage:purge-official-xcom"),
  flushStorage: () => ipcRenderer.invoke("storage:flush"),

  pickProject: () => ipcRenderer.invoke("project:pick"),
  openProject: (projectPath) => ipcRenderer.invoke("project:open", projectPath),
  listProjectSessions: () => ipcRenderer.invoke("project:list-sessions"),

  /** Chat không project — internal sandbox under userData. */
  getStandalonePath: () => ipcRenderer.invoke("standalone:path"),
  openStandalone: () => ipcRenderer.invoke("standalone:open"),
  getStandaloneStore: () => ipcRenderer.invoke("standalone:store"),
  isStandalonePath: (projectPath) => ipcRenderer.invoke("standalone:is", projectPath),

  createTab: (projectPath, opts) =>
    ipcRenderer.invoke("tabs:create", { projectPath, ...opts }),
  switchTab: (projectPath, tabId) =>
    ipcRenderer.invoke("tabs:switch", { projectPath, tabId }),
  closeTab: (projectPath, tabId) =>
    ipcRenderer.invoke("tabs:close", { projectPath, tabId }),
  saveActiveTab: (projectPath, patch) =>
    ipcRenderer.invoke("tabs:save-active", { projectPath, patch }),
  saveTab: (projectPath, tabId, patch) =>
    ipcRenderer.invoke("tabs:save-tab", { projectPath, tabId, patch }),

  setProjectModel: (projectPath, model) =>
    ipcRenderer.invoke("chat:set-model", { projectPath, model }),
  setProjectEffort: (projectPath, reasoningEffort) =>
    ipcRenderer.invoke("chat:set-effort", { projectPath, reasoningEffort }),

  listTree: (projectPath, maxDepth) =>
    ipcRenderer.invoke("fs:tree", { projectPath, maxDepth }),
  readFile: (projectPath, filePath) =>
    ipcRenderer.invoke("fs:read", { projectPath, filePath }),
  listDiffs: () => ipcRenderer.invoke("diff:list"),
  clearDiffs: () => ipcRenderer.invoke("diff:clear"),

  getHarness: (projectPath) => ipcRenderer.invoke("harness:detect", projectPath),
  getRunbooks: (projectPath) => ipcRenderer.invoke("harness:runbooks", projectPath),
  searchRunbooks: (projectPath, query) =>
    ipcRenderer.invoke("harness:search-runbooks", { projectPath, query }),
  getChecklist: (projectPath) => ipcRenderer.invoke("harness:checklist", projectPath),

  getGitInfo: (projectPath) => ipcRenderer.invoke("git:info", projectPath),
  getGitWorktrees: (projectPath) => ipcRenderer.invoke("git:worktrees", projectPath),
  getGitStatus: (projectPath) => ipcRenderer.invoke("git:status", projectPath),

  openPath: (targetPath) => ipcRenderer.invoke("shell:open-path", targetPath),
  showItemInFolder: (targetPath) => ipcRenderer.invoke("shell:show-item", targetPath),
  openExternal: (url) => ipcRenderer.invoke("shell:open-external", url),
  openTerminal: (opts) => ipcRenderer.invoke("shell:open-terminal", opts || {}),
  removeRecentProject: (projectPath) =>
    ipcRenderer.invoke("project:remove-recent", projectPath),

  startAgent: (opts) => ipcRenderer.invoke("agent:start", opts),
  stopAgent: () => ipcRenderer.invoke("agent:stop"),
  newSession: (cwd) => ipcRenderer.invoke("agent:new-session", cwd),
  previewMcpServers: () => ipcRenderer.invoke("mcp:preview"),
  /** @param {string | { text?: string, images?: any[], files?: any[] }} payload */
  sendPrompt: (payload) => ipcRenderer.invoke("agent:prompt", payload),
  cancel: () => ipcRenderer.invoke("agent:cancel"),
  respondPermission: (payload) => ipcRenderer.invoke("agent:permission-response", payload),

  /** OS clipboard image (screenshot / copy image) */
  readClipboardImage: () => ipcRenderer.invoke("clipboard:read-image"),
  /** Read local files by absolute path */
  readAttachmentPaths: (paths) => ipcRenderer.invoke("attachments:read-paths", paths),
  /** Native file picker */
  pickAttachmentFiles: () => ipcRenderer.invoke("attachments:pick-files"),

  /**
   * Popup a top-level app submenu under the custom titlebar label.
   * @param {"file"|"edit"|"view"|"help"} key
   * @param {{ x?: number, y?: number }} pos  screen/window coords (bottom of label)
   */
  popupMenu: (key, pos) =>
    ipcRenderer.invoke("menu:popup", { key, x: pos?.x, y: pos?.y }),

  on: (channel, handler) => {
    const valid = [
      "agent:update",
      "agent:permission",
      "agent:status",
      "agent:stderr",
      "agent:error",
      "agent:exit",
      "agent:session",
      "agent:notification",
      "agent:session-meta",
      "usage:update",
      "usage:context",
      "diff:new",
      "storage:report",
      "storage:hygiene",
      "update:progress",
      "cli:progress",
      "auth:login-progress",
      "menu:open-project",
      "menu:settings",
      "menu:usage",
      "menu:new-chat",
      "menu:toggle-right",
      "menu:terminal",
      "menu:palette",
      "menu:about",
    ];
    if (!valid.includes(channel)) return () => {};
    const listener = (_event, data) => handler(data);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
});
