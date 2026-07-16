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
 * Common prefix/suffix trim — cheap and accurate for typical edits in large files.
 * Avoids the old n*m>400k path that marked entire files as +N/−N (e.g. +18k/−18k).
 */
function commonAffix(a, b) {
  const n = a.length;
  const m = b.length;
  let pre = 0;
  const preMax = Math.min(n, m);
  while (pre < preMax && a[pre] === b[pre]) pre++;
  let suf = 0;
  const sufMax = Math.min(n - pre, m - pre);
  while (suf < sufMax && a[n - 1 - suf] === b[m - 1 - suf]) suf++;
  return { pre, suf, midA: n - pre - suf, midB: m - pre - suf };
}

/**
 * Simple line diff for before/after text.
 */
function lineDiff(before, after, filePath = "") {
  const a = String(before || "").split(/\r?\n/);
  const b = String(after || "").split(/\r?\n/);
  /** @type {{type:'same'|'add'|'del', text:string, line?:number}[]} */
  const lines = [];

  const n = a.length;
  const m = b.length;
  const { pre, suf, midA, midB } = commonAffix(a, b);

  // Unchanged prefix
  for (let k = 0; k < pre; k++) {
    lines.push({ type: "same", text: a[k], line: k + 1 });
  }

  const a0 = pre;
  const b0 = pre;
  const a1 = n - suf; // exclusive end of middle in a
  const b1 = m - suf;

  // Middle: LCS when cheap; otherwise linear scan (not full-file replace)
  const midN = midA;
  const midM = midB;
  let additions = 0;
  let deletions = 0;

  if (midN === 0 && midM === 0) {
    // pure no-op middle
  } else if (midN * midM > 400_000 || midN + midM > 12_000) {
    // Large middle: O(n) walk — count true adds/dels, keep a compact view
    // (common prefix/suffix already stripped so stats match real edit size)
    deletions = midN;
    additions = midM;
    const maxShow = 80;
    for (let k = 0; k < midN; k++) {
      if (k < maxShow) lines.push({ type: "del", text: a[a0 + k] });
    }
    if (midN > maxShow) {
      lines.push({ type: "del", text: `… ${midN - maxShow} dòng xóa khác` });
    }
    for (let k = 0; k < midM; k++) {
      if (k < maxShow) lines.push({ type: "add", text: b[b0 + k], line: b0 + k + 1 });
    }
    if (midM > maxShow) {
      lines.push({ type: "add", text: `… ${midM - maxShow} dòng thêm khác`, line: b1 });
    }
  } else {
    const aa = a.slice(a0, a1);
    const bb = b.slice(b0, b1);
    const nn = aa.length;
    const mm = bb.length;
    const dp = Array.from({ length: nn + 1 }, () => new Uint32Array(mm + 1));
    for (let i = nn - 1; i >= 0; i--) {
      for (let j = mm - 1; j >= 0; j--) {
        dp[i][j] =
          aa[i] === bb[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < nn && j < mm) {
      if (aa[i] === bb[j]) {
        lines.push({ type: "same", text: aa[i], line: b0 + j + 1 });
        i++;
        j++;
      } else if (dp[i + 1][j] >= dp[i][j + 1]) {
        lines.push({ type: "del", text: aa[i] });
        deletions++;
        i++;
      } else {
        lines.push({ type: "add", text: bb[j], line: b0 + j + 1 });
        additions++;
        j++;
      }
    }
    while (i < nn) {
      lines.push({ type: "del", text: aa[i++] });
      deletions++;
    }
    while (j < mm) {
      lines.push({ type: "add", text: bb[j], line: b0 + j + 1 });
      additions++;
      j++;
    }
  }

  // Unchanged suffix
  for (let k = 0; k < suf; k++) {
    const ai = a1 + k;
    const bi = b1 + k;
    lines.push({ type: "same", text: b[bi], line: bi + 1 });
  }

  return { filePath, lines, stats: { additions, deletions } };
}

module.exports = {
  listDir,
  readFileSafe,
  lineDiff,
  isInside,
};
