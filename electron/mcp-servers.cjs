/**
 * Build ACP `mcpServers` list from app settings.
 * Spec: https://agentclientprotocol.com/protocol/v1/session-setup
 * Chrome DevTools MCP: https://github.com/ChromeDevTools/chrome-devtools-mcp
 *
 * IMPORTANT: MCP is bound only at ACP `session/new`. Existing sessions never
 * pick up config changes — user must New Chat / restart agent after toggle.
 */

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

/**
 * @typedef {object} McpEnvVar
 * @property {string} name
 * @property {string} value
 */

/**
 * @typedef {object} AcpStdioMcpServer
 * @property {string} name
 * @property {string} command
 * @property {string[]} args
 * @property {McpEnvVar[]} [env]
 */

/**
 * Absolute path to a binary on PATH (or known install locations).
 * @param {string} name
 * @returns {string | null}
 */
function resolveBinary(name) {
  const candidates = [];
  if (process.platform === "darwin") {
    candidates.push(
      `/opt/homebrew/bin/${name}`,
      `/usr/local/bin/${name}`,
      path.join(os.homedir(), ".local", "bin", name)
    );
  } else if (process.platform === "win32") {
    // leave to where / cmd
  } else {
    candidates.push(`/usr/local/bin/${name}`, `/usr/bin/${name}`);
  }
  for (const p of candidates) {
    try {
      if (p && fs.existsSync(p)) return p;
    } catch {
      /* next */
    }
  }
  try {
    if (process.platform === "win32") {
      const out = execFileSync("where.exe", [name], {
        encoding: "utf8",
        windowsHide: true,
        timeout: 4000,
      });
      const line = String(out)
        .split(/\r?\n/)
        .map((s) => s.trim())
        .find((s) => s);
      return line || null;
    }
    const out = execFileSync("which", [name], {
      encoding: "utf8",
      timeout: 4000,
      env: { ...process.env, PATH: buildMcpPathEnv() },
    });
    const line = String(out).trim().split(/\r?\n/)[0];
    return line || null;
  } catch {
    return null;
  }
}

/**
 * Resolve npx launcher for the current OS.
 * Prefer absolute npx path so packaged apps / agent child can exec without shell PATH.
 * On Windows, `npx` alone is often a .cmd shim — use `cmd /c npx ...`.
 * @returns {{ command: string, prefixArgs: string[] }}
 */
function npxLauncher() {
  if (process.platform === "win32") {
    return {
      command: process.env.ComSpec || "cmd.exe",
      prefixArgs: ["/d", "/s", "/c", "npx"],
    };
  }
  const abs = resolveBinary("npx");
  return { command: abs || "npx", prefixArgs: [] };
}

/**
 * @param {Record<string, unknown>} settings
 * @returns {AcpStdioMcpServer[]}
 */
function buildMcpServers(settings = {}) {
  /** @type {AcpStdioMcpServer[]} */
  const servers = [];

  if (settings.chromeDevtoolsMcp) {
    servers.push(buildChromeDevtoolsMcp(settings));
  }

  return servers;
}

/**
 * @param {Record<string, unknown>} settings
 * @returns {AcpStdioMcpServer}
 */
function buildChromeDevtoolsMcp(settings = {}) {
  const { command, prefixArgs } = npxLauncher();
  const pkg = String(settings.chromeDevtoolsMcpPackage || "chrome-devtools-mcp@latest");
  /** @type {string[]} */
  const args = [...prefixArgs, "-y", pkg];

  // Privacy / noise defaults for a desktop coding shell
  if (settings.chromeDevtoolsMcpNoUsageStats !== false) {
    args.push("--no-usage-statistics");
  }

  if (settings.chromeDevtoolsMcpHeadless) {
    args.push("--headless");
  }

  if (settings.chromeDevtoolsMcpSlim) {
    args.push("--slim");
  }

  if (settings.chromeDevtoolsMcpIsolated) {
    args.push("--isolated");
  }

  const browserUrl = String(settings.chromeDevtoolsMcpBrowserUrl || "").trim();
  if (browserUrl) {
    args.push(`--browser-url=${browserUrl}`);
  }

  /** @type {McpEnvVar[]} */
  const env = [];
  if (settings.chromeDevtoolsMcpNoUsageStats !== false) {
    env.push({ name: "CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS", value: "1" });
  }

  // Ensure node/npx are findable when app is launched from Dock/Finder (minimal PATH).
  const pathKey = process.platform === "win32" ? "Path" : "PATH";
  const pathValue = buildMcpPathEnv();
  if (pathValue) {
    env.push({ name: pathKey, value: pathValue });
    if (pathKey === "Path") env.push({ name: "PATH", value: pathValue });
  }

  // Windows MCP servers often need SystemRoot / ProgramFiles for child processes
  if (process.platform === "win32") {
    if (process.env.SystemRoot) {
      env.push({ name: "SystemRoot", value: process.env.SystemRoot });
    }
    if (process.env.PROGRAMFILES) {
      env.push({ name: "PROGRAMFILES", value: process.env.PROGRAMFILES });
    }
    if (process.env.ProgramFiles) {
      env.push({ name: "ProgramFiles", value: process.env.ProgramFiles });
    }
  }

  return {
    name: "chrome-devtools",
    command,
    args,
    env,
  };
}

/**
 * PATH for MCP child (npx / node / chrome) and for the Grok agent process.
 * Packaged Electron apps often inherit a stripped PATH on macOS.
 */
function buildMcpPathEnv() {
  const sep = process.platform === "win32" ? ";" : ":";
  const extras =
    process.platform === "darwin"
      ? [
          "/opt/homebrew/bin",
          "/usr/local/bin",
          "/usr/bin",
          "/bin",
          path.join(os.homedir(), ".local", "bin"),
          path.join(os.homedir(), ".nvm", "current", "bin"),
        ]
      : process.platform === "win32"
        ? []
        : ["/usr/local/bin", "/usr/bin", "/bin"];

  const cur = process.env.PATH || process.env.Path || "";
  const parts = [...extras, ...cur.split(sep).filter(Boolean)];
  return [...new Set(parts)].join(sep);
}

/**
 * Env overlay for spawning `grok agent` so it can launch MCP (npx/node).
 * @returns {NodeJS.ProcessEnv}
 */
function agentProcessEnv() {
  const env = { ...process.env };
  const pathVal = buildMcpPathEnv();
  if (pathVal) {
    env.PATH = pathVal;
    if (process.platform === "win32") env.Path = pathVal;
  }
  return env;
}

/**
 * Short labels for UI / status.
 * @param {AcpStdioMcpServer[]} servers
 * @returns {string[]}
 */
function mcpServerNames(servers) {
  return (servers || []).map((s) => s.name).filter(Boolean);
}

/**
 * Human-readable summary for chat/status.
 * @param {AcpStdioMcpServer[]} servers
 * @param {Record<string, unknown>} [settings]
 */
function describeMcpServers(servers, settings = {}) {
  if (!servers?.length) return "Không có MCP server inject.";
  return servers
    .map((s) => {
      if (s.name === "chrome-devtools") {
        const bits = ["chrome-devtools-mcp"];
        if (settings.chromeDevtoolsMcpHeadless) bits.push("headless");
        if (settings.chromeDevtoolsMcpSlim) bits.push("slim");
        if (settings.chromeDevtoolsMcpIsolated) bits.push("isolated");
        const url = String(settings.chromeDevtoolsMcpBrowserUrl || "").trim();
        if (url) bits.push(`attach ${url}`);
        return bits.join(" · ");
      }
      return `${s.name} (${path.basename(s.command)} ${s.args?.[0] || ""})`.trim();
    })
    .join("; ");
}

module.exports = {
  buildMcpServers,
  buildChromeDevtoolsMcp,
  mcpServerNames,
  describeMcpServers,
  npxLauncher,
  buildMcpPathEnv,
  agentProcessEnv,
  resolveBinary,
};
