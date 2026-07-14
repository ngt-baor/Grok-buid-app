/**
 * Discover installed Grok / agent skills from standard directories.
 * Mirrors common skill roots used by Grok Build / Claude-style agents.
 */
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const SOURCE_ORDER = {
  project: 0,
  user: 1,
  agents: 2,
  bundled: 3,
};

const SOURCE_LABELS = {
  project: "Project",
  user: "User",
  agents: "Agents",
  bundled: "Bundled",
};

function homeDir() {
  return (
    os.homedir() ||
    process.env.USERPROFILE ||
    process.env.HOME ||
    ""
  );
}

/**
 * @param {string | null | undefined} projectPath
 * @returns {{ root: string, source: string, label: string }[]}
 */
function skillRoots(projectPath) {
  const home = homeDir();
  const roots = [];
  if (home) {
    roots.push({
      root: path.join(home, ".grok", "skills"),
      source: "user",
      label: SOURCE_LABELS.user,
    });
    roots.push({
      root: path.join(home, ".agents", "skills"),
      source: "agents",
      label: SOURCE_LABELS.agents,
    });
    roots.push({
      root: path.join(home, ".grok", "bundled", "skills"),
      source: "bundled",
      label: SOURCE_LABELS.bundled,
    });
  }

  const resourcesPath = process.resourcesPath || "";
  if (resourcesPath) {
    roots.push({
      root: path.join(resourcesPath, "skills"),
      source: "bundled",
      label: "App bundled",
    });
  }
  const proj = String(projectPath || "").trim();
  if (proj) {
    roots.push({
      root: path.join(proj, ".agents", "skills"),
      source: "project",
      label: SOURCE_LABELS.project,
    });
    roots.push({
      root: path.join(proj, ".grok", "skills"),
      source: "project",
      label: SOURCE_LABELS.project,
    });
    roots.push({
      root: path.join(proj, "skills"),
      source: "project",
      label: SOURCE_LABELS.project,
    });
  }
  return roots;
}

/**
 * Parse SKILL.md frontmatter + a short description body.
 * @param {string} raw
 * @param {string} fallbackName
 */
function parseSkillMd(raw, fallbackName) {
  const text = String(raw || "").replace(/^\uFEFF/, "");
  let name = fallbackName;
  let description = "";
  let body = text;

  if (text.startsWith("---")) {
    const end = text.indexOf("\n---", 3);
    if (end !== -1) {
      const fm = text.slice(3, end).trim();
      body = text.slice(end + 4).replace(/^\r?\n/, "");
      // Simple line-based YAML (name / description only)
      let descMultiline = null;
      for (const line of fm.split(/\r?\n/)) {
        const m = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
        if (!m) {
          if (descMultiline !== null) {
            const cont = line.trim();
            if (cont) descMultiline.push(cont.replace(/^[-*]\s+/, ""));
          }
          continue;
        }
        const key = m[1].toLowerCase();
        let val = m[2].trim();
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }
        if (key === "name" && val) name = val;
        if (key === "description") {
          if (val === "|" || val === ">" || val === "") {
            descMultiline = [];
            description = "";
          } else {
            descMultiline = null;
            description = val;
          }
        } else {
          descMultiline = null;
        }
      }
      if (descMultiline && descMultiline.length) {
        description = descMultiline.join(" ").trim();
      }
    }
  }

  if (!description) {
    // First non-heading, non-empty paragraph line
    const lines = body.split(/\r?\n/);
    const bits = [];
    for (const line of lines) {
      const t = line.trim();
      if (!t) {
        if (bits.length) break;
        continue;
      }
      if (t.startsWith("#")) continue;
      if (t.startsWith("```")) continue;
      if (/^---+$/.test(t)) continue;
      bits.push(t.replace(/^[-*]\s+/, ""));
      if (bits.join(" ").length > 220) break;
    }
    description = bits.join(" ").trim();
  }

  // Collapse whitespace; cap length for UI
  description = description.replace(/\s+/g, " ").trim();
  if (description.length > 280) {
    description = description.slice(0, 277).trimEnd() + "…";
  }

  return { name: String(name || fallbackName).trim() || fallbackName, description };
}

/**
 * @param {string} dir
 * @param {{ source: string, label: string, root: string }} meta
 */
function scanSkillDir(dir, meta) {
  /** @type {any[]} */
  const out = [];
  if (!dir || !fs.existsSync(dir)) return out;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }

  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    // Skip non-skill shared helpers (e.g. bundled/skills/shared)
    const skillDir = path.join(dir, ent.name);
    const skillFile = path.join(skillDir, "SKILL.md");
    if (!fs.existsSync(skillFile)) continue;

    let raw = "";
    let mtimeMs = 0;
    try {
      const st = fs.statSync(skillFile);
      mtimeMs = st.mtimeMs || 0;
      // Read first ~12KB — enough for frontmatter + short description
      const fd = fs.openSync(skillFile, "r");
      try {
        const buf = Buffer.alloc(12 * 1024);
        const n = fs.readSync(fd, buf, 0, buf.length, 0);
        raw = buf.slice(0, n).toString("utf8");
      } finally {
        fs.closeSync(fd);
      }
    } catch {
      continue;
    }

    const parsed = parseSkillMd(raw, ent.name);
    out.push({
      id: `${meta.source}:${skillDir}`,
      name: parsed.name,
      folderName: ent.name,
      description: parsed.description,
      source: meta.source,
      sourceLabel: meta.label,
      root: meta.root,
      dir: skillDir,
      skillPath: skillFile,
      mtimeMs,
    });
  }
  return out;
}

/**
 * List all discovered skills.
 * @param {{ projectPath?: string | null }} [opts]
 */
function listSkills(opts = {}) {
  const projectPath = opts.projectPath || null;
  const roots = skillRoots(projectPath);
  /** @type {any[]} */
  const skills = [];
  const scannedRoots = [];

  for (const r of roots) {
    const exists = fs.existsSync(r.root);
    scannedRoots.push({
      path: r.root,
      source: r.source,
      label: r.label,
      exists,
    });
    if (!exists) continue;
    skills.push(...scanSkillDir(r.root, r));
  }

  // Stable sort: source priority, then name
  skills.sort((a, b) => {
    const so =
      (SOURCE_ORDER[a.source] ?? 9) - (SOURCE_ORDER[b.source] ?? 9);
    if (so !== 0) return so;
    return String(a.name).localeCompare(String(b.name), undefined, {
      sensitivity: "base",
    });
  });

  // Unique names count (folder/name may duplicate across roots)
  const uniqueNames = new Set(skills.map((s) => s.name.toLowerCase()));

  return {
    ok: true,
    count: skills.length,
    uniqueCount: uniqueNames.size,
    skills,
    roots: scannedRoots,
    projectPath: projectPath || null,
    fetchedAt: new Date().toISOString(),
  };
}

module.exports = {
  listSkills,
  skillRoots,
  parseSkillMd,
  SOURCE_LABELS,
};
