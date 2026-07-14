const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const PORT = Number(process.env.GROK_BUILD_SMOKE_PORT || 9222);
const BASE = `http://127.0.0.1:${PORT}`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

async function waitForCdp(timeoutMs = 20000) {
  const start = Date.now();
  let last = "";
  while (Date.now() - start < timeoutMs) {
    try {
      return await fetchJson(`${BASE}/json/list`);
    } catch (err) {
      last = String(err.message || err);
      await sleep(400);
    }
  }
  throw new Error(`CDP not reachable on ${BASE} (${last})`);
}

function defaultAppPath() {
  const candidates = [
    path.join(process.cwd(), "release", "win-unpacked", "Grok Build.exe"),
    path.join(process.cwd(), "app", "Grok Build", "Grok Build.exe"),
  ];
  return candidates.find((p) => fs.existsSync(p)) || candidates[0];
}

async function ensureApp() {
  try {
    return await waitForCdp(1500);
  } catch {}

  const exe = process.env.GROK_BUILD_EXE || defaultAppPath();
  if (!fs.existsSync(exe)) {
    throw new Error(`App executable not found: ${exe}`);
  }
  const child = spawn(exe, [`--remote-debugging-port=${PORT}`], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
  return waitForCdp(25000);
}

async function connectPage() {
  const targets = await ensureApp();
  const page = targets.find((t) => t.type === "page") || targets[0];
  if (!page?.webSocketDebuggerUrl) throw new Error("No CDP page target");

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (!msg.id || !pending.has(msg.id)) return;
    const callbacks = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) callbacks.reject(new Error(JSON.stringify(msg.error)));
    else callbacks.resolve(msg.result);
  };
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const msgId = ++id;
      pending.set(msgId, { resolve, reject });
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });

  await send("Runtime.enable");
  await send("Page.enable");
  await send("Page.bringToFront").catch(() => {});
  return { page, ws, send };
}

async function evaluate(send, expression, timeout = 45000) {
  const result = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
    timeout,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || "Runtime exception");
  }
  return result.result?.value;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const { page, ws, send } = await connectPage();
  const versionInfo = await fetchJson(`${BASE}/json/version`);

  const result = await evaluate(
    send,
    `(async () => {
      const app = window.grokApp;
      if (!app) throw new Error('window.grokApp missing');
      const version = await app.getAppVersion();
      const usage = await app.getUsage();
      const skills = await app.listSkills({ projectPath: ${JSON.stringify(process.cwd())}, source: 'all' });
      const bundledOnly = await app.listSkills({ projectPath: null, source: 'all' });
      const update = await app.checkForUpdates();
      const text = document.body ? document.body.innerText : '';
      return {
        version,
        usage: {
          weeklyRemaining: usage?.weeklyQuota?.remainingPercent ?? null,
          creditsRemaining: usage?.credits?.remainingPercent ?? null,
          errors: usage?.errors || null,
        },
        skills: {
          count: skills?.count || 0,
          bundledCount: (bundledOnly?.skills || []).filter((s) => s.source === 'bundled').length,
          sample: (skills?.skills || []).slice(0, 8).map((s) => ({ name: s.name, source: s.source, label: s.sourceLabel })),
        },
        update: {
          ok: update?.ok,
          currentVersion: update?.currentVersion,
          latestVersion: update?.latestVersion,
          updateAvailable: update?.updateAvailable,
          message: update?.message,
        },
        ui: {
          hasSettings: text.includes('C\u00e0i \u0111\u1eb7t') || text.includes('Settings'),
          hasUsage: text.includes('tu\u1ea7n') || text.includes('Usage'),
          title: document.title,
        },
      };
    })()`,
    90000
  );

  assert(result.version?.version, "app version missing");
  assert(result.version?.isPackaged === true, "app is not packaged");
  assert(result.skills.count > 0, "no skills discovered");
  assert(result.skills.bundledCount > 0, "bundled app skills missing");
  assert(result.update?.currentVersion === result.version.version, "update current version mismatch");
  assert(result.ui.hasSettings, "settings entry not visible");
  assert(result.ui.hasUsage, "usage signal not visible");

  ws.close();
  console.log(JSON.stringify({
    ok: true,
    target: page.url,
    browser: versionInfo.Browser,
    userAgent: versionInfo["User-Agent"],
    ...result,
  }, null, 2));
}

main().catch((err) => {
  console.error(`smoke:ui failed: ${err.message || err}`);
  process.exit(1);
});
