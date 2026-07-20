/// <reference types="vite/client" />

export type HarnessInfo = {
  present: boolean;
  version: string | null;
  agentsMd: boolean;
  agentsIndex: boolean;
  memoryMd: boolean;
  runbookIndex: boolean;
  domains: string[];
  paths?: Record<string, string | null>;
};

export type PersonalityId =
  | "realistic"
  | "friendly"
  | "concise"
  | "technical"
  | "playful"
  | "none";

export type AppSettings = {
  grokPath: string;
  model: string;
  reasoningEffort?: string;
  theme: string;
  /** UI language: vi | en */
  locale?: "vi" | "en" | string;
  alwaysApprove: boolean;
  postTaskChecklist?: boolean;
  privacyBanner?: boolean;
  /** Append end-of-turn report card (done + tool summary) after each agent run */
  turnReport?: boolean;
  /** OS notification when a turn finishes and the app is in the background */
  notifyOnTurnDone?: boolean;
  /**
   * When agent is busy on the current tab: queue follow-up prompts (Codex-style).
   * false → send while busy steals (cancel turn, then run new prompt).
   * Default true.
   */
  messageQueueEnabled?: boolean;
  /** auto | wt | cmd | powershell (Win) · auto | terminal | iterm (macOS) */
  terminal?: "auto" | "wt" | "cmd" | "powershell" | "terminal" | "iterm" | string;
  /** Inject chrome-devtools-mcp into ACP session (opt-in) */
  chromeDevtoolsMcp?: boolean;
  chromeDevtoolsMcpHeadless?: boolean;
  chromeDevtoolsMcpSlim?: boolean;
  chromeDevtoolsMcpIsolated?: boolean;
  /** e.g. http://127.0.0.1:9222 — empty launches Chrome via MCP */
  chromeDevtoolsMcpBrowserUrl?: string;
  chromeDevtoolsMcpNoUsageStats?: boolean;
  chromeDevtoolsMcpPackage?: string;
  recentProjects: string[];
  lastProject: string;
  projectModels?: Record<string, string>;

  // Personalization (Codex-like)
  displayName?: string;
  profilePrivate?: boolean;
  personality?: PersonalityId | string;
  customInstructions?: string;
  memoryEnabled?: boolean;
  memoryFromTools?: boolean;
  /**
   * GitHub owner/repo for in-app updates.
   * Default / empty → ngt-baor/Grok-buid-app (package.json + updater fallback).
   */
  updateGithubRepo?: string;
};

export type AppVersionInfo = {
  version: string;
  name: string;
  isPackaged: boolean;
  electron?: string | null;
  platform?: string;
  arch?: string;
  updateGithubRepo?: string;
  resolvedRepo?: string | null;
};

export type UpdateAssetInfo = {
  name: string;
  size: number;
  url: string;
};

export type UpdateCheckResult = {
  ok: boolean;
  status:
    | "up_to_date"
    | "update_available"
    | "no_repo"
    | "no_release"
    | "network_error"
    | "rate_limited"
    | "api_error"
    | "parse_error"
    | "error"
    | string;
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  message: string;
  releaseUrl: string | null;
  asset: UpdateAssetInfo | null;
  body?: string | null;
  publishedAt?: string | null;
  repo?: string | null;
};

export type UpdateProgress = {
  phase: "starting" | "downloading" | "done" | "cancelled" | "error" | string;
  received: number;
  total: number;
  percent: number;
  bytesPerSecond: number;
  speedLabel: string;
  fileName?: string;
  destPath?: string;
  receivedLabel?: string;
  totalLabel?: string;
  error?: string;
};

export type UpdateDownloadResult = {
  ok: boolean;
  path?: string;
  received?: number;
  total?: number;
  fileName?: string;
  receivedLabel?: string;
  totalLabel?: string;
  cancelled?: boolean;
  error?: string;
};

/** Grok CLI install progress (same shape as UpdateProgress + version). */
export type CliProgress = UpdateProgress & {
  version?: string;
};

export type CliStatus = {
  ok: boolean;
  installed: boolean;
  path: string | null;
  binDir: string;
  platform: string | null;
  supported: boolean;
  installCommand: string;
  docsUrl: string;
};

export type CliInstallResult = {
  ok: boolean;
  version?: string;
  path?: string;
  binDir?: string;
  agentPath?: string;
  pathAdded?: boolean;
  fileName?: string;
  received?: number;
  total?: number;
  cancelled?: boolean;
  error?: string;
};

export type ProfileHeatCell = {
  date: string;
  tokens: number;
  level: number;
};

export type ProfileStats = {
  lifetimeTokens: number;
  lifetimeTokensLabel: string;
  peakTokens: number;
  peakTokensLabel: string;
  longestTaskMs: number;
  longestTaskLabel: string;
  currentStreak: number;
  longestStreak: number;
  totalTasks: number;
  skillsDiscovered: number;
  skillsUsedTotal: number;
  topSkills: { name: string; count: number }[];
  fastModePercent: number;
  reasoning: {
    total: number;
    top: string | null;
    topPct: number;
    counts: Record<string, number>;
  };
  heatmap: ProfileHeatCell[];
  heatmapMonths?: {
    date: string;
    label: string;
    month: number;
    year: number;
    weekIndex?: number;
  }[];
  heatmapWeeks?: number;
  heatActiveDays?: number;
  hasData?: boolean;
  sources?: {
    log?: string;
    logPath?: string;
    local?: boolean;
    localPath?: string;
    logTurns?: number;
    logLifetimeTokens?: number;
    logError?: string | null;
  };
  fetchedAt?: string;
  error?: string;
};

export type MemoryItem = {
  id: string;
  text: string;
  source?: string;
  projectPath?: string | null;
  createdAt?: string;
};

export type MemoryStore = {
  version: number;
  memories: MemoryItem[];
  updatedAt?: string | null;
};

export type SkillSource = "user" | "agents" | "bundled" | "project" | string;

export type SkillInfo = {
  id: string;
  name: string;
  folderName: string;
  description: string;
  source: SkillSource;
  sourceLabel: string;
  root: string;
  dir: string;
  skillPath: string;
  mtimeMs?: number;
};

export type SkillRootInfo = {
  path: string;
  source: SkillSource;
  label: string;
  exists: boolean;
};

export type SkillsListResult = {
  ok: boolean;
  count: number;
  uniqueCount: number;
  skills: SkillInfo[];
  roots: SkillRootInfo[];
  projectPath?: string | null;
  fetchedAt?: string;
  error?: string;
};

export type McpPreview = {
  ok: boolean;
  enabled: boolean;
  servers: { name: string; command: string; args: string[] }[];
  summary: string;
};

export type GitInfo = {
  ok: boolean;
  isRepo: boolean;
  branch: string | null;
  dirty?: boolean;
  dirtyCount?: number;
  upstream?: string | null;
  ahead?: number;
  behind?: number;
  root?: string | null;
  shortHash?: string | null;
};

export type GitWorktree = {
  path: string | null;
  head?: string | null;
  branch?: string | null;
  bare?: boolean;
  detached?: boolean;
  locked?: boolean;
  prunable?: boolean;
};

export type GitStatusLine = { code: string; file: string; raw: string };

export type RunbookEntry = {
  id: string;
  title: string;
  symptom?: string;
  path?: string | null;
  tags?: string[];
  domain?: string | null;
};

export type RunbookIndex = {
  ok?: boolean;
  runbooks: RunbookEntry[];
  path?: string;
  count?: number;
  matched?: number;
  query?: string;
  error?: string;
};

export type ChecklistItem = { id: string; label: string; detail: string };
export type ChecklistResult = { items: ChecklistItem[]; harnessPresent: boolean };

export type AuthStatus = {
  loggedIn: boolean;
  expired?: boolean;
  email: string | null;
  /** Grok/xAI profile picture URL when resolvable */
  avatarUrl?: string | null;
  expiresAt: string | null;
  path: string;
};

export type AuthLoginResult = {
  ok: boolean;
  mode?: "device" | "cli" | string;
  binary?: string;
  message?: string;
  error?: string;
  cancelled?: boolean;
  email?: string | null;
  expiresAt?: string;
  path?: string;
};

export type AuthLoginProgress = {
  phase: "starting" | "pending" | "done" | "error" | "cancelled" | string;
  userCode?: string;
  verificationUri?: string;
  verificationUriBase?: string;
  expiresIn?: number;
  interval?: number;
  message?: string;
  error?: string;
  email?: string | null;
  expiresAt?: string;
  path?: string;
};

export type ModelInfo = {
  id: string;
  name: string;
  description?: string;
  contextWindow?: number | null;
  supportsReasoningEffort?: boolean;
  reasoningEfforts?: { id: string; label: string; default?: boolean; value?: string }[];
  default?: boolean;
};

export type TokenWindow = {
  window: string;
  label?: string;
  used: number;
  promptTokens?: number;
  completionTokens?: number;
  reasoningTokens?: number;
  turns?: number;
  limit?: number | null;
  softLimit?: number | null;
  remaining?: number | null;
  remainingPercent?: number | null;
  usedPercent?: number | null;
  unit?: string;
  source?: string;
  note?: string;
  periodStart?: string | null;
  periodEnd?: string | null;
};

export type UsageSnapshot = {
  /** SuperGrok shared weekly pool (web Settings → Usage). Primary gate for Build. */
  weeklyQuota?: TokenWindow | null;
  credits: TokenWindow | null;
  fiveHour: TokenWindow | null;
  /** Local log token totals (7d rolling) — not SuperGrok weekly quota. */
  week: TokenWindow | null;
  context?: {
    promptTokens: number;
    completionTokens: number;
    reasoningTokens: number;
    contextWindow: number;
    usedPercent: number;
    remainingPercent: number;
  } | null;
  errors?: Record<string, string | null | undefined>;
  fetchedAt?: string;
};

export type StorageReport = {
  at: string;
  thresholds: {
    warnBytes: number;
    purgeBytes: number;
    emergencyBytes: number;
    warn: string;
    purge: string;
  };
  app: {
    userData: string;
    userDataBytes: number;
    userDataSize: string;
    indexedDbOrigins: {
      name: string;
      path: string;
      bytes: number;
      walBytes: number;
      size: string;
      walSize: string;
      corruptHint: boolean;
      needsPurge: boolean;
    }[];
  };
  officialGrok: {
    userData: string;
    xcomLevelDb: string;
    xcomBytes: number;
    xcomSize: string;
    needsPurge: boolean;
    indexedDbOrigins: {
      name: string;
      path: string;
      bytes: number;
      walBytes: number;
      size: string;
      walSize: string;
      corruptHint: boolean;
      needsPurge: boolean;
    }[];
  };
};

export type ChatImage = {
  mimeType: string;
  dataUrl: string;
  name?: string;
};

export type ChatFileRef = {
  name: string;
  path?: string;
  mimeType?: string;
  size?: number;
  isBinary?: boolean;
  /** short preview for text files */
  preview?: string;
};

export type PromptImage = {
  mimeType: string;
  /** base64 without data: prefix */
  data: string;
};

export type PromptFile = {
  name: string;
  path?: string;
  uri?: string;
  mimeType?: string;
  text?: string;
  data?: string;
  size?: number;
};

export type ChatItem =
  | {
      id: string;
      kind: "user";
      text: string;
      images?: ChatImage[];
      files?: ChatFileRef[];
      ts?: string;
    }
  | { id: string; kind: "assistant"; text: string; ts?: string }
  | {
      id: string;
      kind: "thought";
      text: string;
      /** UI: expanded body (default collapsed) */
      expanded?: boolean;
      ts?: string;
    }
  | {
      id: string;
      kind: "tool";
      title: string;
      status: string;
      detail?: string;
      /** ACP tool call id — used to merge start/update into one bubble */
      toolCallId?: string;
      /** UI: expanded detail (default collapsed) */
      expanded?: boolean;
      ts?: string;
    }
  | {
      id: string;
      kind: "run";
      /** Elapsed ms for this agent turn (set when turn finishes) */
      durationMs: number;
      /** running while in-flight; done after finish */
      status: "running" | "done" | "cancelled";
      /** UI: expand intermediate activity (default false when done) */
      expanded?: boolean;
      ts?: string;
    }
  | {
      id: string;
      kind: "turn_report";
      /** done | cancelled | error */
      status: "done" | "cancelled" | "error";
      durationMs: number;
      /** Total tool calls in this turn */
      toolCount: number;
      toolOk?: number;
      toolFail?: number;
      /** Unique tool titles (capped) for the bullet summary */
      toolTitles: string[];
      thoughtCount?: number;
      /** Short preview of the final assistant answer */
      assistantPreview?: string;
      /** Id of the run item this report closes */
      runId?: string;
      /**
       * Files written/patched this turn (from diff:new), Codex-style summary.
       * paths capped; totals are full-turn aggregates.
       */
      fileEdits?: {
        files: number;
        additions: number;
        deletions: number;
        paths: { path: string; additions: number; deletions: number }[];
      };
      ts?: string;
    }
  | { id: string; kind: "system"; text: string; ts?: string }
  | { id: string; kind: "error"; text: string; ts?: string };

export type ChatTab = {
  id: string;
  title: string;
  items: ChatItem[];
  model?: string;
  reasoningEffort?: string;
  /** Unsent composer text (persisted per tab) */
  draft?: string;
};

export type ProjectStore = {
  version: number;
  projectPath: string;
  activeTabId: string;
  tabs: ChatTab[];
};

export type FileNode = {
  name: string;
  path: string;
  rel: string;
  type: "file" | "dir";
  depth: number;
  size?: number;
};

export type DiffResult = {
  filePath: string;
  lines: { type: "same" | "add" | "del"; text: string; line?: number }[];
  stats: { additions: number; deletions: number };
  at?: string;
};

export type PermissionRequest = { id: number; params: unknown };

export type ProjectBundle = {
  path: string;
  harness: HarnessInfo;
  settings: AppSettings;
  model: string;
  reasoningEffort: string;
  store: ProjectStore;
  tab: ChatTab;
  chat: { items: ChatItem[] };
};

declare global {
  interface Window {
    grokApp: {
      getSettings: () => Promise<AppSettings>;
      saveSettings: (partial: Partial<AppSettings>) => Promise<AppSettings>;
      getAppVersion: () => Promise<AppVersionInfo>;
      checkForUpdates: () => Promise<UpdateCheckResult>;
      downloadUpdate: (asset: UpdateAssetInfo) => Promise<UpdateDownloadResult>;
      cancelUpdateDownload: () => Promise<{ ok: boolean; cancelled: boolean }>;
      applyUpdate: (payload: {
        path?: string;
        filePath?: string;
        mode?: "open" | "reveal";
      }) => Promise<{ ok: boolean; action?: string; path?: string; error?: string }>;
      getCliStatus: () => Promise<CliStatus>;
      installCli: (opts?: { channel?: string }) => Promise<CliInstallResult>;
      cancelCliInstall: () => Promise<{ ok: boolean; cancelled: boolean }>;
      getAuth: () => Promise<AuthStatus>;
      /** In-app OIDC device-code (no terminal). Progress: auth:login-progress. */
      login: () => Promise<AuthLoginResult>;
      /** Fallback: spawn `grok login` in a visible terminal. */
      loginCli: () => Promise<AuthLoginResult>;
      cancelLogin: () => Promise<{ ok: boolean; cancelled: boolean }>;
      /** Clear ~/.grok/auth.json and return updated status. */
      logout: () => Promise<AuthStatus>;
      listModels: () => Promise<{ ok: boolean; models: ModelInfo[]; error?: string }>;
      getUsage: () => Promise<UsageSnapshot>;
      getProfileStats: () => Promise<ProfileStats>;
      recordTurnActivity: (payload: {
        tokens?: number;
        durationMs?: number;
        effort?: string;
        skills?: string[];
        usedTools?: boolean;
        at?: number;
      }) => Promise<unknown>;
      listMemories: () => Promise<MemoryStore>;
      addMemory: (payload: {
        text: string;
        source?: string;
        projectPath?: string | null;
      }) => Promise<MemoryStore>;
      removeMemory: (id: string) => Promise<MemoryStore>;
      clearMemories: () => Promise<MemoryStore>;
      autoMemoryFromTurn: (payload: {
        summary?: string;
        usedTools?: boolean;
        projectPath?: string | null;
      }) => Promise<MemoryStore>;
      /** Discover installed skills on disk (global + optional project). */
      listSkills: (opts?: { projectPath?: string | null }) => Promise<SkillsListResult>;
      getStorageReport: () => Promise<StorageReport>;
      runStorageHygiene: (opts?: {
        includeOfficialGrok?: boolean;
        forceOfficial?: boolean;
      }) => Promise<{
        ok: boolean;
        freedBytes: number;
        freed: string;
        actions: unknown[];
      }>;
      purgeOfficialXcomIndexedDb: () => Promise<{
        target: string;
        primary: { ok: boolean; freedBytes: number; error?: string };
        freedBytes: number;
      }>;
      flushStorage: () => Promise<{ ok: boolean }>;
      pickProject: () => Promise<ProjectBundle | null>;
      openProject: (projectPath: string) => Promise<ProjectBundle>;
      listProjectSessions: () => Promise<unknown[]>;
      /** Internal sandbox path for chat without a code project. */
      getStandalonePath: () => Promise<string>;
      /** Open / restore standalone (Q&A) workspace — not added to recent projects. */
      openStandalone: () => Promise<ProjectBundle>;
      /** Load standalone tab list without switching active context. */
      getStandaloneStore: () => Promise<ProjectStore>;
      isStandalonePath: (projectPath: string) => Promise<boolean>;
      createTab: (
        projectPath: string,
        opts?: { model?: string; reasoningEffort?: string; title?: string }
      ) => Promise<ProjectStore>;
      switchTab: (projectPath: string, tabId: string) => Promise<ProjectStore>;
      closeTab: (projectPath: string, tabId: string) => Promise<ProjectStore>;
      saveActiveTab: (projectPath: string, patch: Partial<ChatTab>) => Promise<ProjectStore>;
      /** Persist a specific tab (e.g. background agent stream while viewing another tab). */
      saveTab: (
        projectPath: string,
        tabId: string,
        patch: Partial<ChatTab>
      ) => Promise<ProjectStore>;
      setProjectModel: (
        projectPath: string,
        model: string
      ) => Promise<{ ok: boolean; model: string; settings: AppSettings }>;
      setProjectEffort: (
        projectPath: string,
        reasoningEffort: string
      ) => Promise<{ ok: boolean; reasoningEffort: string }>;
      listTree: (projectPath: string, maxDepth?: number) => Promise<FileNode[]>;
      readFile: (
        projectPath: string,
        filePath: string
      ) => Promise<{ path: string; content: string; truncated: boolean; size: number }>;
      listDiffs: () => Promise<DiffResult[]>;
      clearDiffs: () => Promise<{ ok: boolean }>;
      getHarness: (projectPath: string) => Promise<HarnessInfo>;
      getRunbooks: (projectPath: string) => Promise<RunbookIndex>;
      searchRunbooks: (projectPath: string, query: string) => Promise<RunbookIndex>;
      getChecklist: (projectPath: string) => Promise<ChecklistResult>;
      getGitInfo: (projectPath: string) => Promise<GitInfo>;
      getGitWorktrees: (
        projectPath: string
      ) => Promise<{ ok: boolean; worktrees: GitWorktree[]; error?: string }>;
      getGitStatus: (
        projectPath: string
      ) => Promise<{ ok: boolean; lines: GitStatusLine[]; error?: string }>;
      openPath: (targetPath: string) => Promise<{ ok: boolean }>;
      showItemInFolder: (targetPath: string) => Promise<{ ok: boolean }>;
      openExternal: (url: string) => Promise<{ ok: boolean }>;
      openTerminal: (opts?: {
        cwd?: string;
        terminal?: string;
      }) => Promise<{ ok: boolean; cmd?: string; cwd?: string }>;
      getTerminalOptions?: () => Promise<{
        ok: boolean;
        platform: string;
        options: { id: string; label: string }[];
      }>;
      renameProject: (projectPath: string, newName: string) => Promise<ProjectBundle>;
      removeRecentProject: (projectPath: string) => Promise<AppSettings>;
      /** Sync Electron titleBarOverlay / window chrome with light|dark. */
      setChromeTheme?: (theme: "light" | "dark" | string) => Promise<{ ok: boolean }>;
      startAgent: (opts?: Record<string, unknown>) => Promise<{
        ok: boolean;
        sessionId: string;
        cwd: string;
        model: string;
        reasoningEffort: string;
        harness: HarnessInfo;
        mcpServers?: string[];
        mcpSummary?: string;
      }>;
      stopAgent: () => Promise<{ ok: boolean }>;
      newSession: (cwd?: string) => Promise<{
        sessionId: string;
        mcpServers?: string[];
        mcpSummary?: string;
      }>;
      previewMcpServers: () => Promise<McpPreview>;
      sendPrompt: (
        payload:
          | string
          | { text?: string; images?: PromptImage[]; files?: PromptFile[] }
      ) => Promise<unknown>;
      cancel: () => Promise<{ ok: boolean }>;
      respondPermission: (payload: {
        id: number;
        allow: boolean;
        optionId?: string;
      }) => Promise<{ ok: boolean }>;
      readClipboardImage: () => Promise<{
        mimeType: string;
        data: string;
        name: string;
        size: number;
      } | null>;
      readAttachmentPaths: (paths: string[]) => Promise<
        Array<{
          ok: boolean;
          kind?: "image" | "file";
          path?: string;
          name: string;
          mimeType?: string;
          data?: string;
          text?: string;
          size?: number;
          isBinary?: boolean;
          error?: string;
        }>
      >;
      pickAttachmentFiles: () => Promise<string[]>;
      /** Popup native submenu under custom titlebar (file|edit|view|help) */
      popupMenu: (
        key: "file" | "edit" | "view" | "help" | string,
        pos?: { x?: number; y?: number }
      ) => Promise<{ ok: boolean }>;
      on: (channel: string, handler: (data: unknown) => void) => () => void;
    };
  }
}

export {};
