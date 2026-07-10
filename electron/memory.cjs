const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { app } = require("electron");

function memoryPath() {
  return path.join(app.getPath("userData"), "memories.json");
}

function emptyStore() {
  return {
    version: 1,
    memories: [],
    updatedAt: null,
  };
}

function loadMemories() {
  try {
    const file = memoryPath();
    if (!fs.existsSync(file)) return emptyStore();
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    return {
      ...emptyStore(),
      ...raw,
      memories: Array.isArray(raw.memories) ? raw.memories : [],
    };
  } catch {
    return emptyStore();
  }
}

function saveMemories(store) {
  const file = memoryPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const next = {
    ...store,
    version: 1,
    memories: Array.isArray(store.memories) ? store.memories : [],
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(file, JSON.stringify(next, null, 2), "utf8");
  return next;
}

function listMemories() {
  return loadMemories();
}

function addMemory({ text, source = "manual", projectPath = null } = {}) {
  const content = String(text || "").trim();
  if (!content) throw new Error("Memory trống");
  if (content.length > 2000) throw new Error("Memory quá dài (max 2000 ký tự)");

  const store = loadMemories();
  // Dedupe exact text
  const exists = store.memories.some(
    (m) => m.text.trim().toLowerCase() === content.toLowerCase()
  );
  if (exists) return store;

  store.memories.unshift({
    id: crypto.randomUUID(),
    text: content,
    source: source || "manual",
    projectPath: projectPath || null,
    createdAt: new Date().toISOString(),
  });
  // Cap store size
  store.memories = store.memories.slice(0, 80);
  return saveMemories(store);
}

function removeMemory(id) {
  const store = loadMemories();
  store.memories = store.memories.filter((m) => m.id !== id);
  return saveMemories(store);
}

function clearMemories() {
  return saveMemories(emptyStore());
}

/**
 * Build a short memory block for prompt injection (most recent first).
 */
function formatMemoriesForPrompt(limit = 12) {
  const store = loadMemories();
  const items = store.memories.slice(0, limit);
  if (!items.length) return "";
  const lines = items.map((m, i) => `${i + 1}. ${m.text}`);
  return [
    "User memories (apply when relevant; do not invent extra facts):",
    ...lines,
  ].join("\n");
}

/**
 * Heuristic auto-memory from a finished turn summary.
 * Only stores short, non-secret-looking lines.
 * Callers must enforce memoryEnabled / memoryFromTools gates.
 */
function maybeAutoMemoryFromTurn({ summary, usedTools, projectPath }) {
  if (!summary || typeof summary !== "string") return null;
  const text = summary.replace(/\s+/g, " ").trim();
  if (text.length < 24 || text.length > 400) return null;

  // Skip likely secrets
  if (
    /api[_-]?key|secret|password|token\s*[:=]|Bearer\s+[A-Za-z0-9]|sk-[A-Za-z0-9]/i.test(
      text
    )
  ) {
    return null;
  }

  return addMemory({
    text,
    source: usedTools ? "tool-task" : "task",
    projectPath: projectPath || null,
  });
}

module.exports = {
  listMemories,
  addMemory,
  removeMemory,
  clearMemories,
  formatMemoriesForPrompt,
  maybeAutoMemoryFromTurn,
  memoryPath,
  loadMemories,
};
