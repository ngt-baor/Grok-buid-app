/**
 * Build ACP `mcpServers` list from app settings.
 * Spec: https://agentclientprotocol.com/protocol/v1/session-setup
 * Chrome DevTools MCP: https://github.com/ChromeDevTools/chrome-devtools-mcp
 */

const path = require("node:path");

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
 * Resolve npx launcher for the current OS.
 * On Windows, `npx` alone is often a .cmd shim that stdio MCP spawn cannot exec —
 * use `cmd /c npx ...` like official chrome-devtools-mcp Windows notes.
 * @returns {{ command: string, prefixArgs: string[] }}
 */
function npxLauncher() {
  if (process.platform === "win32") {
    return {
      command: process.env.ComSpec || "cmd.exe",
      prefixArgs: ["/d", "/s", "/c", "npx"],
    };
  }
  return { command: "npx", prefixArgs: [] };
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
    // Ensure PATH is inherited for node/npx discovery when env is overridden by agent
    if (process.env.PATH) {
      env.push({ name: "PATH", value: process.env.PATH });
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
};
