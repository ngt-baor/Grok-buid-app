const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { app } = require("electron");

function sessionsRoot() {
  return path.join(app.getPath("userData"), "project-sessions");
}

/**
 * Real on-disk workspace for "chat không project" (Q&A / skills / general).
 * Agent cwd is this folder (sandbox) — not listed under recent projects.
 */
function getStandalonePath() {
  const p = path.join(app.getPath("userData"), "standalone-workspace");
  try {
    fs.mkdirSync(p, { recursive: true });
    const readme = path.join(p, "README.txt");
    if (!fs.existsSync(readme)) {
      fs.writeFileSync(
        readme,
        "Grok Build — workspace chat không project.\n" +
          "Agent dùng folder này làm cwd khi bạn chat ngoài project.\n" +
          "Không mở folder này như project code.\n",
        "utf8"
      );
    }
  } catch {
    /* ignore */
  }
  return p;
}

function isStandalonePath(projectPath) {
  if (!projectPath) return false;
  try {
    const a = path.resolve(String(projectPath)).toLowerCase();
    const b = path.resolve(getStandalonePath()).toLowerCase();
    return a === b;
  } catch {
    return false;
  }
}

function projectKey(projectPath) {
  const normalized = path.resolve(projectPath).toLowerCase();
  return crypto.createHash("sha1").update(normalized).digest("hex").slice(0, 16);
}

function projectDir(projectPath) {
  return path.join(sessionsRoot(), projectKey(projectPath));
}

function renameProjectSession(oldProjectPath, newProjectPath) {
  const oldDir = projectDir(oldProjectPath);
  const newDir = projectDir(newProjectPath);
  if (oldDir === newDir) return { moved: false };
  if (!fs.existsSync(oldDir)) {
    if (fs.existsSync(newDir)) {
      throw new Error("Project m\u1edbi \u0111\u00e3 c\u00f3 l\u1ecbch s\u1eed chat kh\u00e1c.");
    }
    return { moved: false };
  }
  if (fs.existsSync(newDir)) {
    throw new Error("Project m\u1edbi \u0111\u00e3 c\u00f3 l\u1ecbch s\u1eed chat kh\u00e1c.");
  }
  fs.mkdirSync(sessionsRoot(), { recursive: true });
  fs.renameSync(oldDir, newDir);
  const storeFile = path.join(newDir, "store.json");
  try {
    if (fs.existsSync(storeFile)) {
      const store = JSON.parse(fs.readFileSync(storeFile, "utf8"));
      store.projectPath = path.resolve(newProjectPath);
      fs.writeFileSync(storeFile, JSON.stringify(store, null, 2), "utf8");
    }
  } catch (err) {
    try {
      fs.renameSync(newDir, oldDir);
    } catch {
      /* preserve the original error; the caller reports the failed rename */
    }
    throw err;
  }
  return { moved: true };
}

function storePath(projectPath) {
  return path.join(projectDir(projectPath), "store.json");
}

function newTab(partial = {}) {
  return {
    id: crypto.randomUUID(),
    title: partial.title || "Chat",
    items: Array.isArray(partial.items) ? partial.items : [],
    model: partial.model || "grok-4.5",
    reasoningEffort: partial.reasoningEffort || "high",
    draft: typeof partial.draft === "string" ? partial.draft : "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function defaultStore(projectPath) {
  const standalone = isStandalonePath(projectPath);
  const tab = newTab({ title: standalone ? "Hỏi đáp" : "Chat 1" });
  return {
    version: 2,
    projectPath: path.resolve(projectPath),
    activeTabId: tab.id,
    tabs: [tab],
    updatedAt: new Date().toISOString(),
  };
}

function migrateV1(projectPath) {
  // v1: chat.json + meta.json
  const dir = projectDir(projectPath);
  const chatFile = path.join(dir, "chat.json");
  const metaFile = path.join(dir, "meta.json");
  let items = [];
  let model = "grok-4.5";
  try {
    if (fs.existsSync(chatFile)) {
      const c = JSON.parse(fs.readFileSync(chatFile, "utf8"));
      items = Array.isArray(c.items) ? c.items : [];
    }
  } catch {
    /* ignore */
  }
  try {
    if (fs.existsSync(metaFile)) {
      const m = JSON.parse(fs.readFileSync(metaFile, "utf8"));
      model = m.model || model;
    }
  } catch {
    /* ignore */
  }
  const tab = newTab({ title: "Chat 1", items, model });
  return {
    version: 2,
    projectPath: path.resolve(projectPath),
    activeTabId: tab.id,
    tabs: [tab],
    updatedAt: new Date().toISOString(),
  };
}

function loadStore(projectPath) {
  const file = storePath(projectPath);
  try {
    if (fs.existsSync(file)) {
      const data = JSON.parse(fs.readFileSync(file, "utf8"));
      if (data.version >= 2 && Array.isArray(data.tabs) && data.tabs.length) {
        return data;
      }
    }
  } catch {
    /* fallthrough */
  }
  // migrate or create
  const dir = projectDir(projectPath);
  if (fs.existsSync(path.join(dir, "chat.json"))) {
    return migrateV1(projectPath);
  }
  return defaultStore(projectPath);
}

function saveStore(projectPath, store) {
  const dir = projectDir(projectPath);
  fs.mkdirSync(dir, { recursive: true });
  const next = {
    ...store,
    version: 2,
    projectPath: path.resolve(projectPath),
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(storePath(projectPath), JSON.stringify(next, null, 2), "utf8");
  return next;
}

function getActiveTab(store) {
  return store.tabs.find((t) => t.id === store.activeTabId) || store.tabs[0];
}

function loadProjectSession(projectPath) {
  const store = loadStore(projectPath);
  const tab = getActiveTab(store);
  return { store, tab };
}

function patchTab(store, idx, patch) {
  store.tabs[idx] = {
    ...store.tabs[idx],
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  // auto title from first user message (default Chat* / Hỏi đáp* titles only)
  const curTitle = store.tabs[idx].title || "";
  const isDefaultTitle =
    !curTitle ||
    /^Chat(\s+\d+)?$/i.test(curTitle) ||
    /^Hỏi đáp(\s+\d+)?$/i.test(curTitle);
  if (isDefaultTitle && Array.isArray(patch.items)) {
    const firstUser = patch.items.find((i) => i.kind === "user");
    if (firstUser?.text) {
      store.tabs[idx].title = String(firstUser.text).slice(0, 40).replace(/\s+/g, " ");
    }
  }
  return store;
}

function saveActiveTab(projectPath, patch) {
  const store = loadStore(projectPath);
  const idx = store.tabs.findIndex((t) => t.id === store.activeTabId);
  if (idx < 0) return store;
  return saveStore(projectPath, patchTab(store, idx, patch || {}));
}

/** Persist a specific tab (background stream while user views another tab). */
function saveTab(projectPath, tabId, patch) {
  const store = loadStore(projectPath);
  const idx = store.tabs.findIndex((t) => t.id === tabId);
  if (idx < 0) throw new Error("Tab không tồn tại");
  return saveStore(projectPath, patchTab(store, idx, patch || {}));
}

function createTab(projectPath, { model, reasoningEffort, title } = {}) {
  const store = loadStore(projectPath);
  const standalone = isStandalonePath(projectPath);
  const tab = newTab({
    title:
      title ||
      (standalone ? `Hỏi đáp ${store.tabs.length + 1}` : `Chat ${store.tabs.length + 1}`),
    model: model || getActiveTab(store).model,
    reasoningEffort: reasoningEffort || getActiveTab(store).reasoningEffort,
  });
  store.tabs.push(tab);
  store.activeTabId = tab.id;
  return saveStore(projectPath, store);
}

function switchTab(projectPath, tabId) {
  const store = loadStore(projectPath);
  if (!store.tabs.some((t) => t.id === tabId)) throw new Error("Tab không tồn tại");
  store.activeTabId = tabId;
  return saveStore(projectPath, store);
}

function closeTab(projectPath, tabId) {
  const store = loadStore(projectPath);
  if (store.tabs.length <= 1) {
    // reset single tab instead of deleting last
    const standalone = isStandalonePath(projectPath);
    const tab = newTab({
      title: standalone ? "Hỏi đáp" : "Chat 1",
      model: store.tabs[0]?.model,
    });
    store.tabs = [tab];
    store.activeTabId = tab.id;
    return saveStore(projectPath, store);
  }
  store.tabs = store.tabs.filter((t) => t.id !== tabId);
  if (store.activeTabId === tabId) {
    store.activeTabId = store.tabs[0].id;
  }
  return saveStore(projectPath, store);
}

function listProjectSessions() {
  const root = sessionsRoot();
  if (!fs.existsSync(root)) return [];
  const out = [];
  for (const name of fs.readdirSync(root)) {
    const file = path.join(root, name, "store.json");
    const legacy = path.join(root, name, "meta.json");
    try {
      if (fs.existsSync(file)) {
        const s = JSON.parse(fs.readFileSync(file, "utf8"));
        out.push({
          projectPath: s.projectPath,
          tabCount: s.tabs?.length || 0,
          updatedAt: s.updatedAt,
        });
      } else if (fs.existsSync(legacy)) {
        out.push(JSON.parse(fs.readFileSync(legacy, "utf8")));
      }
    } catch {
      /* skip */
    }
  }
  return out.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
}

module.exports = {
  projectKey,
  renameProjectSession,
  loadStore,
  saveStore,
  loadProjectSession,
  saveActiveTab,
  saveTab,
  createTab,
  switchTab,
  closeTab,
  listProjectSessions,
  newTab,
  getStandalonePath,
  isStandalonePath,
};
