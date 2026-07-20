#!/usr/bin/env node
/**
 * Enable Chrome DevTools MCP for:
 * 1) Grok Build App (settings.json → inject into ACP sessions)
 * 2) Project Grok CLI (.mcp.json + .grok/config.toml)
 * 3) Global Grok CLI (~/.grok/config.toml) if missing
 *
 * Usage: node scripts/enable-chrome-devtools-mcp.cjs
 * Then: restart Grok session / app, open a NEW chat, retest.
 */
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const root = path.resolve(__dirname, "..");
const home = os.homedir();

const MCP_BLOCK = `
[mcp_servers.chrome-devtools]
command = "npx"
args = ["-y", "chrome-devtools-mcp@latest", "--no-usage-statistics"]
`.trim();

const MCP_JSON = {
  mcpServers: {
    "chrome-devtools": {
      command: "npx",
      args: ["-y", "chrome-devtools-mcp@latest", "--no-usage-statistics"],
    },
  },
};

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function writeJson(file, data) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function mergeTomlMcp(file) {
  ensureDir(path.dirname(file));
  let text = "";
  if (fs.existsSync(file)) text = fs.readFileSync(file, "utf8");
  if (/\[mcp_servers\.chrome-devtools\]/.test(text)) {
    console.log(`  OK (already) ${file}`);
    return;
  }
  const next = text.trimEnd() ? `${text.trimEnd()}\n\n${MCP_BLOCK}\n` : `${MCP_BLOCK}\n`;
  fs.writeFileSync(file, next, "utf8");
  console.log(`  WROTE  ${file}`);
}

function enableAppSettings() {
  const candidates = [
    path.join(home, "Library/Application Support/grok-build-app/settings.json"),
    path.join(home, "Library/Application Support/Grok Build App/settings.json"),
    path.join(home, "Library/Application Support/Grok Build/settings.json"),
    path.join(process.env.APPDATA || "", "grok-build-app", "settings.json"),
  ].filter((p) => p && !p.includes(path.sep + path.sep));

  let hit = 0;
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    hit += 1;
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    const next = {
      ...raw,
      chromeDevtoolsMcp: true,
      chromeDevtoolsMcpHeadless: false,
      chromeDevtoolsMcpSlim: false,
      chromeDevtoolsMcpIsolated: false,
      chromeDevtoolsMcpNoUsageStats: true,
      chromeDevtoolsMcpPackage: raw.chromeDevtoolsMcpPackage || "chrome-devtools-mcp@latest",
    };
    fs.writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`, "utf8");
    console.log(`  WROTE  ${file}  (chromeDevtoolsMcp=true)`);
  }
  if (!hit) {
    console.log("  skip    app settings.json not found (open the app once, then re-run)");
  }
}

console.log("Enable Chrome DevTools MCP\n");

console.log("1) Project MCP files");
writeJson(path.join(root, ".mcp.json"), MCP_JSON);
console.log("  WROTE  .mcp.json");
mergeTomlMcp(path.join(root, ".grok", "config.toml"));

console.log("\n2) Global Grok CLI (~/.grok/config.toml)");
mergeTomlMcp(path.join(home, ".grok", "config.toml"));

console.log("\n3) Grok Build App settings");
enableAppSettings();

console.log("\nDone. Next steps:");
console.log("  • Restart Grok CLI / Grok Build App");
console.log("  • Open a NEW chat session (old sessions keep old MCP list)");
console.log('  • Ask: "mở chrome và search grok"');
console.log("  • First run may download chrome-devtools-mcp via npx (needs network)");
console.log("  • Chrome must be installed; first open may show a new Chromium/Chrome window");
