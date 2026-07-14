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

/**
 * Normalize memory text: collapse horizontal whitespace only.
 * Keep newlines so markdown structure (headings/tables) survives re-injection.
 */
function normalizeMemoryText(input) {
  return String(input || "")
    .replace(/\r\n/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ \n/g, "\n")
    .replace(/\n /g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function addMemory({ text, source = "manual", projectPath = null } = {}) {
  const content = normalizeMemoryText(text);
  if (!content) throw new Error("Memory trống");
  if (content.length > 2000) throw new Error("Memory quá dài (max 2000 ký tự)");

  const store = loadMemories();
  // Dedupe exact text (compare collapsed-space form so "a  b" == "a b")
  const key = content.toLowerCase();
  const exists = store.memories.some(
    (m) => normalizeMemoryText(m.text).toLowerCase() === key
  );
  if (exists) return store;

  store.memories.unshift({
    id: crypto.randomUUID(),
    text: content,
    source: source || "manual",
    projectPath: projectPath || null,
    createdAt: new Date().toISOString(),
  });
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
 * Multi-line memories are indented so structure is visible to the model.
 */
function formatMemoriesForPrompt(limit = 12) {
  const store = loadMemories();
  const items = store.memories.slice(0, limit);
  if (!items.length) return "";
  const blocks = items.map((m, i) => {
    const text = normalizeMemoryText(m.text);
    if (!text.includes("\n")) return `${i + 1}. ${text}`;
    const lines = text.split("\n");
    const head = `${i + 1}. ${lines[0]}`;
    const rest = lines
      .slice(1)
      .map((ln) => (ln.length ? `   ${ln}` : ""))
      .join("\n");
    return rest ? `${head}\n${rest}` : head;
  });
  return [
    "User memories (apply when relevant; do not invent extra facts):",
    ...blocks,
  ].join("\n");
}

/**
 * Heuristic auto-memory from a finished turn summary.
 * Only stores short, non-secret-looking notes.
 * Callers must enforce memoryEnabled / memoryFromTools gates.
 *
 * IMPORTANT: keep newlines — collapsing to one line makes later chat
 * re-emit unreadable walls of markdown.
 */
function maybeAutoMemoryFromTurn({ summary, usedTools, projectPath }) {
  if (!summary || typeof summary !== "string") return null;
  let text = normalizeMemoryText(summary);
  if (text.length < 24) return null;

  // Cap at ~400 chars, prefer cutting on a newline
  if (text.length > 400) {
    const cut = text.slice(0, 400);
    const lastNl = cut.lastIndexOf("\n");
    text = (lastNl >= 120 ? cut.slice(0, lastNl) : cut).trim();
    if (text.length < 24) return null;
  }

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
  normalizeMemoryText,
  memoryPath,
  loadMemories,
};
