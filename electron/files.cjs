const fs = require("node:fs");
const path = require("node:path");

const IGNORE = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "out",
  ".next",
  "target",
  "__pycache__",
  ".venv",
  "venv",
  ".turbo",
  "coverage",
  ".cache",
]);

function isInside(root, target) {
  const r = path.resolve(root);
  const t = path.resolve(target);
  return t === r || t.startsWith(r + path.sep);
}

function listDir(root, rel = "", depth = 0, maxDepth = 3, maxEntries = 400) {
  const abs = path.join(root, rel);
  if (!isInside(root, abs) || !fs.existsSync(abs)) return [];

  /** @type {any[]} */
  const out = [];
  let count = 0;

  function walk(dirRel, d) {
    if (count >= maxEntries || d > maxDepth) return;
    const dirAbs = path.join(root, dirRel);
    let entries;
    try {
      entries = fs.readdirSync(dirAbs, { withFileTypes: true });
    } catch {
      return;
    }

    entries.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

    for (const ent of entries) {
      if (count >= maxEntries) break;
      if (ent.name.startsWith(".") && ent.name !== ".agents" && ent.name !== ".gitignore") continue;
      if (IGNORE.has(ent.name)) continue;

      const childRel = dirRel ? `${dirRel}/${ent.name}` : ent.name;
      const childAbs = path.join(root, childRel);
      count += 1;

      if (ent.isDirectory()) {
        out.push({
          name: ent.name,
          path: childAbs,
          rel: childRel.replace(/\\/g, "/"),
          type: "dir",
          depth: d,
        });
        walk(childRel, d + 1);
      } else {
        let size = 0;
        try {
          size = fs.statSync(childAbs).size;
        } catch {
          /* ignore */
        }
        out.push({
          name: ent.name,
          path: childAbs,
          rel: childRel.replace(/\\/g, "/"),
          type: "file",
          depth: d,
          size,
        });
      }
    }
  }

  walk(rel, depth);
  return out;
}

function readFileSafe(root, filePath, maxBytes = 400_000) {
  const abs = path.resolve(filePath);
  if (!isInside(root, abs)) throw new Error("File ngoài project.");
  if (!fs.existsSync(abs)) throw new Error("File không tồn tại.");
  const stat = fs.statSync(abs);
  if (!stat.isFile()) throw new Error("Không phải file.");
  if (stat.size > maxBytes) {
    const buf = Buffer.alloc(maxBytes);
    const fd = fs.openSync(abs, "r");
    fs.readSync(fd, buf, 0, maxBytes, 0);
    fs.closeSync(fd);
    return {
      path: abs,
      content: buf.toString("utf8"),
      truncated: true,
      size: stat.size,
    };
  }
  return {
    path: abs,
    content: fs.readFileSync(abs, "utf8"),
    truncated: false,
    size: stat.size,
  };
}

/**
 * Simple line diff for before/after text.
 */
function lineDiff(before, after, filePath = "") {
  const a = String(before || "").split(/\r?\n/);
  const b = String(after || "").split(/\r?\n/);
  /** @type {{type:'same'|'add'|'del', text:string, line?:number}[]} */
  const lines = [];

  // LCS-lite for moderate files
  const n = a.length;
  const m = b.length;
  if (n * m > 400_000) {
    // fallback: full replace view
    for (const t of a) lines.push({ type: "del", text: t });
    for (const t of b) lines.push({ type: "add", text: t });
    return { filePath, lines, stats: { additions: m, deletions: n } };
  }

  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  let i = 0;
  let j = 0;
  let additions = 0;
  let deletions = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      lines.push({ type: "same", text: a[i], line: j + 1 });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      lines.push({ type: "del", text: a[i] });
      deletions++;
      i++;
    } else {
      lines.push({ type: "add", text: b[j], line: j + 1 });
      additions++;
      j++;
    }
  }
  while (i < n) {
    lines.push({ type: "del", text: a[i++] });
    deletions++;
  }
  while (j < m) {
    lines.push({ type: "add", text: b[j], line: j + 1 });
    additions++;
    j++;
  }

  return { filePath, lines, stats: { additions, deletions } };
}

module.exports = {
  listDir,
  readFileSafe,
  lineDiff,
  isInside,
};
