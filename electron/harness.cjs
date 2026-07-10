const fs = require("node:fs");
const path = require("node:path");

/**
 * Detect Harness Engineering layout in a project folder.
 */
function detectHarness(projectPath) {
  if (!projectPath) {
    return {
      present: false,
      version: null,
      agentsMd: false,
      agentsIndex: false,
      memoryMd: false,
      runbookIndex: false,
      paths: {},
      domains: [],
    };
  }

  const root = path.resolve(projectPath);
  const agentsMd = path.join(root, "AGENTS.md");
  const agentsIndex = path.join(root, ".agents", "index.md");
  const memoryMd = path.join(root, "MEMORY.md");
  const runbookIndex = path.join(root, ".agents", "runbooks", "_index.json");
  const harnessTxt = path.join(root, "Harness-Engineering.txt");

  const hasAgents = fs.existsSync(agentsMd);
  const hasIndex = fs.existsSync(agentsIndex);
  const hasMemory = fs.existsSync(memoryMd);
  const hasRunbooks = fs.existsSync(runbookIndex);
  const hasHarnessDoc = fs.existsSync(harnessTxt);

  const domains = [];
  const memoryDir = path.join(root, ".agents", "memory");
  if (fs.existsSync(memoryDir)) {
    for (const name of fs.readdirSync(memoryDir)) {
      if (name.endsWith(".md")) domains.push(path.basename(name, ".md"));
    }
  }

  let version = null;
  if (hasIndex || hasRunbooks) version = "V2.1";
  else if (hasAgents || hasHarnessDoc) version = "V1";

  return {
    present: hasAgents || hasIndex || hasHarnessDoc,
    version,
    agentsMd: hasAgents,
    agentsIndex: hasIndex,
    memoryMd: hasMemory,
    runbookIndex: hasRunbooks,
    harnessDoc: hasHarnessDoc,
    paths: {
      agentsMd: hasAgents ? agentsMd : null,
      agentsIndex: hasIndex ? agentsIndex : null,
      memoryMd: hasMemory ? memoryMd : null,
      runbookIndex: hasRunbooks ? runbookIndex : null,
    },
    domains,
  };
}

function readRunbookIndex(projectPath) {
  const file = path.join(path.resolve(projectPath), ".agents", "runbooks", "_index.json");
  if (!fs.existsSync(file)) return { ok: true, runbooks: [], path: file };
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    // Support array or { runbooks: [] } or { entries: [] }
    let list = [];
    if (Array.isArray(raw)) list = raw;
    else if (Array.isArray(raw.runbooks)) list = raw.runbooks;
    else if (Array.isArray(raw.entries)) list = raw.entries;
    else if (raw && typeof raw === "object") {
      // object map id -> meta
      list = Object.entries(raw)
        .filter(([k]) => !k.startsWith("_"))
        .map(([id, v]) => (typeof v === "object" && v ? { id, ...v } : { id, title: String(v) }));
    }
    const runbooks = list.map((r, i) => normalizeRunbook(r, i));
    return { ok: true, runbooks, path: file, count: runbooks.length };
  } catch (err) {
    return { ok: false, runbooks: [], error: String(err.message || err), path: file };
  }
}

function normalizeRunbook(r, i) {
  if (typeof r === "string") {
    return { id: `rb-${i}`, title: r, symptom: r, path: null, tags: [], domain: null };
  }
  const title = r.title || r.name || r.id || r.symptom || `runbook-${i}`;
  const tags = Array.isArray(r.tags) ? r.tags : r.tag ? [r.tag] : [];
  return {
    id: String(r.id || r.slug || title),
    title: String(title),
    symptom: r.symptom || r.symptoms || r.description || r.summary || "",
    path: r.path || r.file || r.href || null,
    tags: tags.map(String),
    domain: r.domain || r.area || null,
    raw: r,
  };
}

/**
 * Search runbooks by symptom / title / tags (read-only).
 */
function searchRunbooks(projectPath, query = "") {
  const index = readRunbookIndex(projectPath);
  const q = String(query || "")
    .trim()
    .toLowerCase();
  if (!q) return index;
  const tokens = q.split(/\s+/).filter(Boolean);
  const runbooks = (index.runbooks || []).filter((rb) => {
    const hay = [rb.title, rb.symptom, rb.domain, ...(rb.tags || []), rb.path]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return tokens.every((t) => hay.includes(t));
  });
  return { ...index, runbooks, query: q, matched: runbooks.length };
}

function postTaskChecklist(harness) {
  const items = [
    {
      id: "verify",
      label: "Verify",
      detail: "Đã verify chưa? (Tier 1 smoke / Tier 2 tests / Tier 3 full)",
    },
    {
      id: "distill",
      label: "Distill",
      detail: "KEEP / DISCARD / UNCERTAIN — ghi ngắn kết quả học được",
    },
    {
      id: "record",
      label: "Record",
      detail: harness?.memoryMd
        ? "Cân nhắc ghi MEMORY.md / runbook (không secret)"
        : "Project chưa có MEMORY.md — optional tạo local",
    },
    {
      id: "privacy",
      label: "Privacy",
      detail: "Không commit .agents/, MEMORY.md, secrets",
    },
  ];
  return { items, harnessPresent: Boolean(harness?.present) };
}

module.exports = {
  detectHarness,
  readRunbookIndex,
  searchRunbooks,
  postTaskChecklist,
};
