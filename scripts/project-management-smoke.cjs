const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");

const userData = fs.mkdtempSync(path.join(os.tmpdir(), "grok-project-management-"));
const originalLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  if (request === "electron") {
    return { app: { getPath: (name) => (name === "userData" ? userData : userData) } };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const sessions = require("../electron/sessions.cjs");
const appSource = fs.readFileSync(path.join(__dirname, "..", "src", "App.tsx"), "utf8");
const mainSource = fs.readFileSync(path.join(__dirname, "..", "electron", "main.cjs"), "utf8");
const preloadSource = fs.readFileSync(path.join(__dirname, "..", "electron", "preload.cjs"), "utf8");
const i18nSource = fs.readFileSync(path.join(__dirname, "..", "src", "i18n.ts"), "utf8");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "grok-projects-"));
const oldProject = path.join(root, "Work", "Project");
const newProject = path.join(root, "Archive", "Project-renamed");
const otherProject = path.join(root, "Other", "Project");
fs.mkdirSync(oldProject, { recursive: true });
fs.mkdirSync(otherProject, { recursive: true });

const originalStore = {
  version: 2,
  projectPath: path.resolve(oldProject),
  activeTabId: "tab-1",
  tabs: [
    {
      id: "tab-1",
      title: "Chat 1",
      items: [{ kind: "user", id: "msg-1", text: "keep this chat" }],
    },
  ],
};
sessions.saveStore(oldProject, originalStore);
assert.notEqual(sessions.projectKey(oldProject), sessions.projectKey(otherProject));

const move = sessions.renameProjectSession(oldProject, newProject);
assert.equal(move.moved, true);
const restored = sessions.loadStore(newProject);
assert.equal(restored.projectPath, path.resolve(newProject));
assert.equal(restored.tabs[0].items[0].text, "keep this chat");
assert.equal(
  fs.existsSync(path.join(userData, "project-sessions", sessions.projectKey(oldProject), "store.json")),
  false
);
const renamedTabStore = sessions.saveTab(newProject, "tab-1", { title: "Renamed chat" });
assert.equal(renamedTabStore.tabs[0].title, "Renamed chat");
assert.equal(sessions.loadStore(newProject).tabs[0].title, "Renamed chat");


assert.match(appSource, /projectDisplayName\(p, sidebarProjects\)/);
assert.match(appSource, /newTab\(\{ projectPath: p \}\)/);
assert.match(appSource, /\{active && \(/);
assert.match(appSource, /requestRenameProject/);
assert.match(mainSource, /ipcMain\.handle\("project:rename"/);
assert.match(preloadSource, /ipcRenderer\.invoke\("project:rename"/);
assert.match(appSource, /renderChatMenu\(p, tab\.id/);
assert.match(appSource, /window\.grokApp\.saveTab\(conf\.projectPath, conf\.tabId/);
assert.match(appSource, /t\("chat\.rename"\)/);
assert.match(i18nSource, /"chat\.rename": "\\u0110\\u1ed5i t\\u00ean chat"/);
assert.match(i18nSource, /"chat\.rename": "Rename chat"/);
assert.match(i18nSource, /"chat\.stopDeleteTitle": "Stop and delete chat"/);
assert.match(appSource, /"chat\.stopDeleteTitle"/);

fs.rmSync(root, { recursive: true, force: true });
fs.rmSync(userData, { recursive: true, force: true });
console.log(JSON.stringify({ ok: true, checks: 20, message: "Project and chat management regression checks passed." }));
