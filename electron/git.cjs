const fs = require("node:fs");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const execFileAsync = promisify(execFile);

async function runGit(projectPath, args, timeout = 5000) {
  const { stdout, stderr } = await execFileAsync("git", ["-C", projectPath, ...args], {
    timeout,
    windowsHide: true,
    maxBuffer: 2 * 1024 * 1024,
  });
  return { stdout: String(stdout || ""), stderr: String(stderr || "") };
}

/**
 * Rich git summary for composer chips + git panel.
 */
async function getGitInfo(projectPath) {
  if (!projectPath || !fs.existsSync(projectPath)) {
    return {
      ok: false,
      isRepo: false,
      branch: null,
      dirty: false,
      dirtyCount: 0,
      upstream: null,
      ahead: 0,
      behind: 0,
      root: null,
      shortHash: null,
    };
  }

  try {
    const { stdout: rootOut } = await runGit(projectPath, ["rev-parse", "--show-toplevel"]);
    const root = rootOut.trim() || null;
    if (!root) {
      return {
        ok: false,
        isRepo: false,
        branch: null,
        dirty: false,
        dirtyCount: 0,
        upstream: null,
        ahead: 0,
        behind: 0,
        root: null,
        shortHash: null,
      };
    }

    const { stdout: branchOut } = await runGit(projectPath, ["rev-parse", "--abbrev-ref", "HEAD"]);
    const branch = branchOut.trim() || null;

    let shortHash = null;
    try {
      const { stdout: hashOut } = await runGit(projectPath, ["rev-parse", "--short", "HEAD"]);
      shortHash = hashOut.trim() || null;
    } catch {
      /* empty repo */
    }

    let dirty = false;
    let dirtyCount = 0;
    try {
      const { stdout: st } = await runGit(projectPath, ["status", "--porcelain"]);
      const lines = st.split(/\r?\n/).filter(Boolean);
      dirtyCount = lines.length;
      dirty = dirtyCount > 0;
    } catch {
      /* ignore */
    }

    let upstream = null;
    let ahead = 0;
    let behind = 0;
    try {
      const { stdout: up } = await runGit(projectPath, [
        "rev-parse",
        "--abbrev-ref",
        "--symbolic-full-name",
        "@{u}",
      ]);
      upstream = up.trim() || null;
      if (upstream) {
        const { stdout: counts } = await runGit(projectPath, [
          "rev-list",
          "--left-right",
          "--count",
          "HEAD...@{u}",
        ]);
        const parts = counts.trim().split(/\s+/);
        ahead = Number(parts[0]) || 0;
        behind = Number(parts[1]) || 0;
      }
    } catch {
      /* no upstream */
    }

    return {
      ok: true,
      isRepo: true,
      branch,
      dirty,
      dirtyCount,
      upstream,
      ahead,
      behind,
      root,
      shortHash,
    };
  } catch {
    return {
      ok: false,
      isRepo: false,
      branch: null,
      dirty: false,
      dirtyCount: 0,
      upstream: null,
      ahead: 0,
      behind: 0,
      root: null,
      shortHash: null,
    };
  }
}

/**
 * Parse `git worktree list --porcelain`.
 */
async function listWorktrees(projectPath) {
  if (!projectPath || !fs.existsSync(projectPath)) {
    return { ok: false, worktrees: [], error: "no project" };
  }
  try {
    // Ensure we're in a repo first
    await runGit(projectPath, ["rev-parse", "--is-inside-work-tree"]);
    const { stdout } = await runGit(projectPath, ["worktree", "list", "--porcelain"]);
    const blocks = stdout.split(/\n(?=worktree )/g).filter((b) => b.trim());
    const worktrees = [];
    for (const block of blocks) {
      const lines = block.split(/\r?\n/).filter(Boolean);
      const wt = {
        path: null,
        head: null,
        branch: null,
        bare: false,
        detached: false,
        locked: false,
        prunable: false,
      };
      for (const line of lines) {
        if (line.startsWith("worktree ")) wt.path = line.slice("worktree ".length).trim();
        else if (line.startsWith("HEAD ")) wt.head = line.slice("HEAD ".length).trim();
        else if (line.startsWith("branch ")) {
          const ref = line.slice("branch ".length).trim();
          wt.branch = ref.replace(/^refs\/heads\//, "");
        } else if (line === "bare") wt.bare = true;
        else if (line === "detached") wt.detached = true;
        else if (line.startsWith("locked")) wt.locked = true;
        else if (line.startsWith("prunable")) wt.prunable = true;
      }
      if (wt.path) worktrees.push(wt);
    }
    return { ok: true, worktrees };
  } catch (err) {
    return { ok: false, worktrees: [], error: String(err.message || err) };
  }
}

/**
 * Short status lines for UI (max 40).
 */
async function getGitStatus(projectPath) {
  if (!projectPath || !fs.existsSync(projectPath)) {
    return { ok: false, lines: [] };
  }
  try {
    const { stdout } = await runGit(projectPath, ["status", "--porcelain", "-uall"]);
    const lines = stdout
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(0, 40)
      .map((line) => {
        const code = line.slice(0, 2);
        const file = line.slice(3).trim();
        return { code, file, raw: line };
      });
    return { ok: true, lines };
  } catch (err) {
    return { ok: false, lines: [], error: String(err.message || err) };
  }
}

function isPathInside(parent, child) {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

module.exports = {
  getGitInfo,
  listWorktrees,
  getGitStatus,
  isPathInside,
};
