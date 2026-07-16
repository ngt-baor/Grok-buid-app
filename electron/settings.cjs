const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { app } = require("electron");

const DEFAULT_GROK = path.join(os.homedir(), ".grok", "bin", "grok.exe");

function settingsPath() {
  return path.join(app.getPath("userData"), "settings.json");
}

function defaultSettings() {
  return {
    grokPath: fs.existsSync(DEFAULT_GROK) ? DEFAULT_GROK : "grok",
    model: "grok-4.5",
    reasoningEffort: "high",
    theme: "dark",
    /**
     * UI language: vi | en
     * Affects app chrome (sidebar, settings, menus). Agent replies stay model-driven.
     */
    locale: "vi",
    alwaysApprove: false,
    /** Show post-task harness checklist after each agent turn */
    postTaskChecklist: true,
    /** Append end-of-turn report (đã chạy xong + tóm tắt tools) after each agent run */
    turnReport: true,
    /** Desktop notification when turn finishes while app is in background */
    notifyOnTurnDone: true,
    /**
     * Codex-style message queue while agent is busy on the current tab.
     * true (default) → follow-ups enqueue; false → send steals (cancel + run new).
     */
    messageQueueEnabled: true,
    /** Privacy banner when harness / MEMORY detected */
    privacyBanner: true,
    /** Preferred external terminal: auto | wt | cmd | powershell */
    terminal: "auto",
    /**
     * Inject chrome-devtools-mcp into ACP session/new (opt-in).
     * Agent can control/inspect Chrome for UI verify, console, network, screenshots.
     */
    chromeDevtoolsMcp: false,
    /** Run Chrome headless (no browser window) */
    chromeDevtoolsMcpHeadless: false,
    /** Slim tool surface (nav + screenshot + evaluate only) */
    chromeDevtoolsMcpSlim: false,
    /** Temporary isolated Chrome profile */
    chromeDevtoolsMcpIsolated: false,
    /** Optional attach: e.g. http://127.0.0.1:9222 — empty = MCP launches Chrome */
    chromeDevtoolsMcpBrowserUrl: "",
    /** Opt out of Google usage stats for chrome-devtools-mcp (default true) */
    chromeDevtoolsMcpNoUsageStats: true,
    /** npm package pin, default chrome-devtools-mcp@latest */
    chromeDevtoolsMcpPackage: "chrome-devtools-mcp@latest",
    recentProjects: [],
    lastProject: "",
    /** @type {Record<string, string>} projectPath -> model */
    projectModels: {},
    /** @type {Record<string, string>} projectPath -> effort */
    projectEfforts: {},

    // ── Personalization (Codex-like) ──────────────────────────
    /** Display name override for profile (empty = use auth email local-part) */
    displayName: "",
    /** Profile visibility flag (local only; not published) */
    profilePrivate: true,
    /**
     * Default reply tone:
     * realistic | friendly | concise | technical | playful
     */
    personality: "realistic",
    /**
     * Custom instructions injected into every agent prompt on this host.
     * Empty = no extra block (personality still applies if set).
     */
    customInstructions: "",
    /** Create & inject memories across tasks (experimental) */
    memoryEnabled: true,
    /** Allow auto-memories from turns that used tools / MCP / web */
    memoryFromTools: true,
    /**
     * GitHub repo for in-app updates (owner/repo).
     * Default = public release repo. Empty also falls back to package.json / DEFAULT.
     */
    updateGithubRepo: "ngt-baor/Grok-buid-app",
  };
}

function loadSettings() {
  const file = settingsPath();
  try {
    if (!fs.existsSync(file)) return defaultSettings();
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    const merged = { ...defaultSettings(), ...raw };
    // Empty / whitespace repo → always track public release repo
    if (!String(merged.updateGithubRepo || "").trim()) {
      merged.updateGithubRepo = defaultSettings().updateGithubRepo;
    }
    // Never surface standalone workspace in the project list.
    if (Array.isArray(merged.recentProjects) && standalonePathCheck) {
      merged.recentProjects = merged.recentProjects.filter(
        (p) => !standalonePathCheck(p)
      );
    }
    return merged;
  } catch {
    return defaultSettings();
  }
}

function saveSettings(partial) {
  const next = { ...loadSettings(), ...partial };
  const file = settingsPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(next, null, 2), "utf8");
  return next;
}

/**
 * Optional filter: standalone workspace must never appear under recent projects.
 * Passed in from main when available (avoids circular require with sessions).
 * @type {((p: string) => boolean) | null}
 */
let standalonePathCheck = null;

function setStandalonePathCheck(fn) {
  standalonePathCheck = typeof fn === "function" ? fn : null;
}

function rememberProject(projectPath) {
  const settings = loadSettings();
  const normalized = path.resolve(projectPath);
  // Chat không project: restore last context only — never pollute recent list.
  if (standalonePathCheck && standalonePathCheck(normalized)) {
    return saveSettings({ lastProject: normalized });
  }
  const recent = [
    normalized,
    ...settings.recentProjects
      .filter((p) => path.resolve(p) !== normalized)
      .filter((p) => !(standalonePathCheck && standalonePathCheck(p))),
  ].slice(0, 16);
  return saveSettings({ recentProjects: recent, lastProject: normalized });
}

function modelForProject(projectPath) {
  const settings = loadSettings();
  if (!projectPath) return settings.model || "grok-4.5";
  const key = path.resolve(projectPath);
  return settings.projectModels?.[key] || settings.model || "grok-4.5";
}

function setModelForProject(projectPath, model) {
  const settings = loadSettings();
  const key = path.resolve(projectPath);
  const projectModels = { ...(settings.projectModels || {}), [key]: model };
  return saveSettings({ projectModels, model });
}

/**
 * Personality → short instruction for prompt injection.
 */
function personalityInstruction(personality) {
  const map = {
    realistic:
      "Tone: realistic and direct. Prefer concrete facts, trade-offs, and actionable steps over fluff.",
    friendly:
      "Tone: friendly and encouraging. Stay clear and helpful without being verbose.",
    concise:
      "Tone: concise. Prefer short answers, bullet points, and minimal preamble.",
    technical:
      "Tone: technical and precise. Use correct terminology, structure by systems, cite files/paths when relevant.",
    playful:
      "Tone: light and playful when appropriate, but never sacrifice correctness or safety.",
  };
  return map[personality] || map.realistic;
}

/**
 * Build optional personalization prefix for agent prompts.
 * Returns null when nothing to inject.
 */
function buildPersonalizationPrefix(settings, { memoriesBlock = "" } = {}) {
  const s = settings || loadSettings();
  const parts = [];

  const p = s.personality || "realistic";
  if (p && p !== "none") {
    parts.push(personalityInstruction(p));
  }

  const custom = String(s.customInstructions || "").trim();
  if (custom) {
    parts.push("Custom user instructions (follow unless they conflict with safety):\n" + custom);
  }

  if (s.memoryEnabled !== false && memoriesBlock) {
    parts.push(memoriesBlock);
  }

  if (!parts.length) return null;

  return (
    "[Personalization — apply for this entire task]\n" +
    parts.join("\n\n") +
    "\n[End personalization]\n\n"
  );
}

module.exports = {
  DEFAULT_GROK,
  loadSettings,
  saveSettings,
  rememberProject,
  modelForProject,
  setModelForProject,
  settingsPath,
  personalityInstruction,
  buildPersonalizationPrefix,
  setStandalonePathCheck,
};
