const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { app } = require("electron");

const DAY_MS = 24 * 60 * 60 * 1000;
/** Max log bytes to scan for lifetime-ish stats. */
const MAX_LOG_BYTES = 32 * 1024 * 1024;

function activityPath() {
  let userData = "";
  try {
    userData = app.getPath("userData");
  } catch {
    userData =
      process.env.GROK_BUILD_USER_DATA ||
      path.join(
        process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"),
        "grok-build-app"
      );
  }
  return path.join(userData, "activity.json");
}

function emptyActivity() {
  return {
    version: 1,
    /** ISO date (YYYY-MM-DD) -> { tokens, turns, maxDurationMs } */
    days: {},
    lifetimeTokens: 0,
    peakTokens: 0,
    longestTaskMs: 0,
    totalTasks: 0,
    effortCounts: { high: 0, medium: 0, low: 0, other: 0 },
    skillUses: {},
    updatedAt: null,
  };
}

function loadActivity() {
  try {
    const file = activityPath();
    if (!fs.existsSync(file)) return emptyActivity();
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    return { ...emptyActivity(), ...raw, days: raw.days || {} };
  } catch {
    return emptyActivity();
  }
}

function saveActivity(data) {
  const file = activityPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const next = { ...data, updatedAt: new Date().toISOString() };
  fs.writeFileSync(file, JSON.stringify(next, null, 2), "utf8");
  return next;
}

function dayKey(ts) {
  const d = new Date(ts);
  if (!Number.isFinite(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function normalizeEffort(v) {
  const s = String(v || "").toLowerCase();
  if (!s) return "other";
  if (s.includes("high") || s === "h") return "high";
  if (s.includes("med") || s === "m") return "medium";
  if (s.includes("low") || s === "l") return "low";
  return "other";
}

/**
 * Record a completed app turn (duration, tokens, effort, skills).
 * Called from main process after agent turns / inference events.
 */
function recordTurnActivity({
  tokens = 0,
  durationMs = 0,
  effort = "",
  skills = [],
  usedTools = false,
  at = Date.now(),
} = {}) {
  try {
    const act = loadActivity();
    const key = dayKey(at);
    if (!key) return act;

    const tok = Math.max(0, Number(tokens) || 0);
    const dur = Math.max(0, Number(durationMs) || 0);

    const day = act.days[key] || { tokens: 0, turns: 0, maxDurationMs: 0 };
    day.tokens = (day.tokens || 0) + tok;
    day.turns = (day.turns || 0) + 1;
    day.maxDurationMs = Math.max(day.maxDurationMs || 0, dur);
    act.days[key] = day;

    act.lifetimeTokens = (act.lifetimeTokens || 0) + tok;
    act.peakTokens = Math.max(act.peakTokens || 0, tok);
    act.longestTaskMs = Math.max(act.longestTaskMs || 0, dur);
    act.totalTasks = (act.totalTasks || 0) + 1;

    const e = normalizeEffort(effort);
    act.effortCounts = act.effortCounts || { high: 0, medium: 0, low: 0, other: 0 };
    act.effortCounts[e] = (act.effortCounts[e] || 0) + 1;

    if (Array.isArray(skills)) {
      act.skillUses = act.skillUses || {};
      for (const sk of skills) {
        const name = String(sk || "").trim();
        if (!name) continue;
        act.skillUses[name] = (act.skillUses[name] || 0) + 1;
      }
    }

    if (usedTools) {
      act.toolTurns = (act.toolTurns || 0) + 1;
    }

    return saveActivity(act);
  } catch (err) {
    console.warn("[profile-stats] recordTurnActivity failed:", err?.message || err);
    return emptyActivity();
  }
}

function resolveLogPath() {
  const home = os.homedir() || process.env.USERPROFILE || process.env.HOME || "";
  const candidates = [
    home ? path.join(home, ".grok", "logs", "unified.jsonl") : "",
    process.env.USERPROFILE
      ? path.join(process.env.USERPROFILE, ".grok", "logs", "unified.jsonl")
      : "",
    process.env.HOME ? path.join(process.env.HOME, ".grok", "logs", "unified.jsonl") : "",
    // Grok CLI sometimes uses APPDATA\grok on Windows
    process.env.APPDATA
      ? path.join(process.env.APPDATA, "grok", "logs", "unified.jsonl")
      : "",
  ].filter(Boolean);
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      /* continue */
    }
  }
  return (
    candidates[0] ||
    path.join(home || ".", ".grok", "logs", "unified.jsonl")
  );
}

/**
 * Sum inference tokens from the log for events with ts >= sinceMs.
 * Used as fallback when ACP does not stream usage into the app.
 * Reads only the last ~4MB for speed.
 */
function tokensSince(sinceMs) {
  const logPath = resolveLogPath();
  const out = {
    tokens: 0,
    turns: 0,
    peakTokens: 0,
    longestTaskMs: 0,
    logPath,
    /** Last inference in window — used for context-window chip (prompt fill). */
    lastPromptTokens: 0,
    lastCompletionTokens: 0,
    lastReasoningTokens: 0,
    lastCachedPromptTokens: 0,
    peakPromptTokens: 0,
  };
  if (!fs.existsSync(logPath) || !Number.isFinite(sinceMs)) return out;
  try {
    const stat = fs.statSync(logPath);
    const start = Math.max(0, stat.size - 4 * 1024 * 1024);
    const len = stat.size - start;
    if (len <= 0) return out;
    const fd = fs.openSync(logPath, "r");
    let text = "";
    try {
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, start);
      text = buf.toString("utf8");
    } finally {
      fs.closeSync(fd);
    }
    const lines = text.split(/\r?\n/);
    let i = start > 0 ? 1 : 0;
    // Small skew: CLI timestamps can lag a bit behind our wall clock start
    const cut = sinceMs - 2000;
    for (; i < lines.length; i++) {
      const line = lines[i];
      if (!line || !line.includes("inference_done")) continue;
      let j;
      try {
        j = JSON.parse(line);
      } catch {
        continue;
      }
      if (j.msg !== "shell.turn.inference_done" || !j.ctx) continue;
      const ts = Date.parse(j.ts);
      if (!Number.isFinite(ts) || ts < cut) continue;
      const pt = Number(j.ctx.prompt_tokens) || 0;
      const ct = Number(j.ctx.completion_tokens) || 0;
      const rt = Number(j.ctx.reasoning_tokens) || 0;
      const cached = Number(j.ctx.cached_prompt_tokens) || 0;
      const total = pt + ct + (rt > 0 && ct === 0 ? rt : 0);
      out.tokens += total;
      out.turns += 1;
      out.peakTokens = Math.max(out.peakTokens, total);
      out.peakPromptTokens = Math.max(out.peakPromptTokens, pt);
      out.lastPromptTokens = pt;
      out.lastCompletionTokens = ct;
      out.lastReasoningTokens = rt;
      out.lastCachedPromptTokens = cached;
      const elapsed = Number(j.ctx.elapsed_since_turn_start_ms) || 0;
      if (elapsed > 0) out.longestTaskMs = Math.max(out.longestTaskMs, elapsed);
    }
  } catch (err) {
    console.warn("[profile-stats] tokensSince failed:", err?.message || err);
  }
  return out;
}

/**
 * Most recent shell.turn.inference_done in unified.jsonl (any time).
 * Fallback when ACP never streams usage — context chip needs prompt_tokens.
 */
function latestInferenceFromLog() {
  const logPath = resolveLogPath();
  if (!logPath || !fs.existsSync(logPath)) return null;
  try {
    const stat = fs.statSync(logPath);
    const start = Math.max(0, stat.size - 2 * 1024 * 1024);
    const len = stat.size - start;
    if (len <= 0) return null;
    const fd = fs.openSync(logPath, "r");
    let text = "";
    try {
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, start);
      text = buf.toString("utf8");
    } finally {
      fs.closeSync(fd);
    }
    const lines = text.split(/\r?\n/);
    let last = null;
    let i = start > 0 ? 1 : 0;
    for (; i < lines.length; i++) {
      const line = lines[i];
      if (!line || !line.includes("inference_done")) continue;
      let j;
      try {
        j = JSON.parse(line);
      } catch {
        continue;
      }
      if (j.msg !== "shell.turn.inference_done" || !j.ctx) continue;
      const pt = Number(j.ctx.prompt_tokens) || 0;
      const ct = Number(j.ctx.completion_tokens) || 0;
      const rt = Number(j.ctx.reasoning_tokens) || 0;
      const cached = Number(j.ctx.cached_prompt_tokens) || 0;
      if (pt <= 0 && ct <= 0 && rt <= 0) continue;
      last = {
        promptTokens: pt,
        completionTokens: ct,
        reasoningTokens: rt,
        cachedPromptTokens: cached,
        updatedAt: j.ts || new Date().toISOString(),
        source: "unified.jsonl",
      };
    }
    return last;
  } catch (err) {
    console.warn("[profile-stats] latestInferenceFromLog failed:", err?.message || err);
    return null;
  }
}

/**
 * Scan Grok unified.jsonl for inference tokens (lifetime window = scanned slice).
 * Uses sync tail-read — more reliable than streaming when the CLI holds the file open.
 */
function aggregateFromLogs() {
  const logPath = resolveLogPath();
  const result = {
    logPath,
    source: "missing-log",
    lifetimeTokens: 0,
    peakTokens: 0,
    turns: 0,
    longestTaskMs: 0,
    /** YYYY-MM-DD -> tokens */
    daily: {},
    effortCounts: { high: 0, medium: 0, low: 0, other: 0 },
    skillUses: {},
  };

  if (!fs.existsSync(logPath)) return result;

  let text = "";
  try {
    const stat = fs.statSync(logPath);
    const start = Math.max(0, stat.size - MAX_LOG_BYTES);
    const len = stat.size - start;
    if (len <= 0) {
      result.source = "unified.jsonl";
      return result;
    }
    const fd = fs.openSync(logPath, "r");
    try {
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, start);
      text = buf.toString("utf8");
    } finally {
      fs.closeSync(fd);
    }
    result.source = "unified.jsonl";
  } catch (err) {
    result.source = "error";
    result.error = String(err.message || err);
    return result;
  }

  const lines = text.split(/\r?\n/);
  // If we seek mid-file, first line is often a partial JSON fragment
  let i = text.length > 0 && !text.startsWith("{") && !text.startsWith("\n{") ? 1 : 0;
  // Safer: if we read a tail slice, always drop first line when start>0
  try {
    const stat = fs.statSync(logPath);
    if (stat.size > MAX_LOG_BYTES) i = 1;
  } catch {
    /* ignore */
  }

  for (; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    if (line.includes("inference_done")) {
      let j;
      try {
        j = JSON.parse(line);
      } catch {
        continue;
      }
      if (j.msg !== "shell.turn.inference_done" || !j.ctx) continue;
      const ts = Date.parse(j.ts);
      const pt = Number(j.ctx.prompt_tokens) || 0;
      const ct = Number(j.ctx.completion_tokens) || 0;
      const rt = Number(j.ctx.reasoning_tokens) || 0;
      // Match usage panel: prompt + completion (reasoning often nested in completion)
      const total = pt + ct + (rt > 0 && ct === 0 ? rt : 0);
      result.lifetimeTokens += total;
      result.peakTokens = Math.max(result.peakTokens, total);
      result.turns += 1;
      const elapsed = Number(j.ctx.elapsed_since_turn_start_ms) || 0;
      if (elapsed > 0) result.longestTaskMs = Math.max(result.longestTaskMs, elapsed);
      const key = dayKey(Number.isFinite(ts) ? ts : Date.now());
      if (key) {
        result.daily[key] = (result.daily[key] || 0) + total;
      }
      const effort =
        j.ctx.reasoning_effort ||
        j.ctx.effort ||
        j.ctx.reasoningEffort ||
        j.ctx.model_effort;
      if (effort) {
        const e = normalizeEffort(effort);
        result.effortCounts[e] = (result.effortCounts[e] || 0) + 1;
      }
      continue;
    }

    if (line.includes("skill") && (line.includes("skill_use") || line.includes("skills/"))) {
      let j;
      try {
        j = JSON.parse(line);
      } catch {
        continue;
      }
      const name =
        j.ctx?.skill ||
        j.ctx?.skill_name ||
        j.ctx?.skillName ||
        j.ctx?.name ||
        null;
      if (name && typeof name === "string") {
        const n = name.replace(/^\$/, "").trim();
        if (n) result.skillUses[n] = (result.skillUses[n] || 0) + 1;
      }
    }
  }

  return result;
}

function computeStreaks(daySet) {
  const today = dayKey(Date.now());
  const parse = (k) => {
    const [y, m, d] = k.split("-").map(Number);
    return new Date(y, m - 1, d).getTime();
  };

  let current = 0;
  let longest = 0;
  let run = 0;

  const keys = [...daySet].sort();
  let prev = null;
  for (const k of keys) {
    if (prev == null) {
      run = 1;
    } else {
      const gap = (parse(k) - parse(prev)) / DAY_MS;
      run = gap === 1 ? run + 1 : 1;
    }
    longest = Math.max(longest, run);
    prev = k;
  }

  if (daySet.has(today)) {
    current = 1;
    let t = parse(today) - DAY_MS;
    while (daySet.has(dayKey(t))) {
      current += 1;
      t -= DAY_MS;
    }
  } else {
    const yday = dayKey(Date.now() - DAY_MS);
    if (daySet.has(yday)) {
      current = 1;
      let t = parse(yday) - DAY_MS;
      while (daySet.has(dayKey(t))) {
        current += 1;
        t -= DAY_MS;
      }
    }
  }

  return { currentStreak: current, longestStreak: Math.max(longest, current) };
}

/**
 * Calendar-year heatmap: Jan 1 → Dec 31 of the current year.
 * Pads start back to Sunday and end forward to Saturday so CSS 7-row week columns align.
 * Month labels on the UI are then Tháng 1 … Tháng 12 (not a Codex rolling window).
 */
function buildHeatmap(dailyTokens) {
  const cells = [];
  const year = new Date().getFullYear();
  let start = new Date(year, 0, 1);
  start.setDate(start.getDate() - start.getDay()); // pad to Sunday (may be Dec prev year)
  const end = new Date(year, 11, 31);
  const endPad = new Date(end);
  if (endPad.getDay() < 6) {
    endPad.setDate(endPad.getDate() + (6 - endPad.getDay()));
  }

  for (let d = new Date(start); d.getTime() <= endPad.getTime(); d.setDate(d.getDate() + 1)) {
    const key = dayKey(d.getTime());
    const tokens = dailyTokens[key] || 0;
    cells.push({ date: key, tokens, level: heatLevel(tokens) });
  }
  return cells;
}

function heatLevel(tokens) {
  if (!tokens || tokens <= 0) return 0;
  if (tokens < 5_000) return 1;
  if (tokens < 25_000) return 2;
  if (tokens < 100_000) return 3;
  if (tokens < 400_000) return 4;
  return 5;
}

function formatTokensShort(n) {
  const v = Number(n) || 0;
  const fmt = (x) => x.toFixed(1).replace(/\.0$/, "").replace(".", ",");
  if (v >= 1e9) return `${fmt(v / 1e9)} Tỷ`;
  if (v >= 1e6) return `${fmt(v / 1e6)} Tr`;
  if (v >= 1e3) return `${fmt(v / 1e3)} N`;
  return String(Math.round(v));
}

/** Format like Codex: "32p 40s" */
function formatDurationShort(ms) {
  const t = Math.max(0, Math.floor(Number(ms) || 0));
  if (t < 1000) return "0s";
  const totalSec = Math.floor(t / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}g ${m}p`;
  if (m > 0) return s > 0 ? `${m}p ${s}s` : `${m}p`;
  return `${s}s`;
}

function topSkills(skillUses, limit = 5) {
  return Object.entries(skillUses || {})
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

function effortBreakdown(counts) {
  const total =
    (counts.high || 0) +
    (counts.medium || 0) +
    (counts.low || 0) +
    (counts.other || 0);
  if (!total) {
    return { total: 0, top: null, topPct: 0, counts };
  }
  const entries = [
    ["high", counts.high || 0],
    ["medium", counts.medium || 0],
    ["low", counts.low || 0],
    ["other", counts.other || 0],
  ].sort((a, b) => b[1] - a[1]);
  const [top, n] = entries[0];
  return {
    total,
    top: n > 0 ? top : null,
    topPct: n > 0 ? Math.round((n / total) * 100) : 0,
    counts,
  };
}

function heatmapMonthLabels(cells) {
  if (!cells.length) return [];
  // Prefer the year with the most cells so pad days in adjacent years don't shift the axis.
  const yearCounts = {};
  for (const c of cells) {
    const y = Number(String(c.date).split("-")[0]);
    if (Number.isFinite(y)) yearCounts[y] = (yearCounts[y] || 0) + 1;
  }
  const primaryYear =
    Number(
      Object.entries(yearCounts).sort((a, b) => b[1] - a[1])[0]?.[0]
    ) || new Date().getFullYear();

  // First cell index per calendar month → weekIndex (guarantees Tháng 1 … Tháng 12 order).
  const firstWeekByMonth = {};
  for (let i = 0; i < cells.length; i++) {
    const [y, m] = String(cells[i].date).split("-");
    if (Number(y) !== primaryYear) continue;
    const month = Number(m);
    if (firstWeekByMonth[month] === undefined) {
      firstWeekByMonth[month] = {
        date: cells[i].date,
        weekIndex: Math.floor(i / 7),
      };
    }
  }

  const labels = [];
  for (let month = 1; month <= 12; month++) {
    const hit = firstWeekByMonth[month];
    if (!hit) continue;
    labels.push({
      date: hit.date,
      label: `Tháng ${month}`,
      month,
      year: primaryYear,
      weekIndex: hit.weekIndex,
    });
  }
  return labels;
}

function emptyProfileStats(extra = {}) {
  const heatmap = buildHeatmap({});
  return {
    lifetimeTokens: 0,
    lifetimeTokensLabel: "0",
    peakTokens: 0,
    peakTokensLabel: "0",
    longestTaskMs: 0,
    longestTaskLabel: "0s",
    currentStreak: 0,
    longestStreak: 0,
    totalTasks: 0,
    skillsDiscovered: 0,
    skillsUsedTotal: 0,
    topSkills: [],
    fastModePercent: 0,
    reasoning: { total: 0, top: null, topPct: 0, counts: {} },
    heatmap,
    heatmapMonths: heatmapMonthLabels(heatmap),
    heatmapWeeks: Math.ceil(heatmap.length / 7),
    heatActiveDays: 0,
    hasData: false,
    sources: { log: "none", local: false },
    fetchedAt: new Date().toISOString(),
    ...extra,
  };
}

/**
 * Warm local activity cache from CLI logs when empty/stale.
 * Merge at read time still uses Math.max so we never double-count display.
 */
function warmActivityFromLogs(logs) {
  if (!logs || !(logs.lifetimeTokens > 0) || !logs.daily) return null;
  try {
    const act = loadActivity();
    const localLt = act.lifetimeTokens || 0;
    // Only warm when local is empty or clearly behind the log scan
    if (localLt > 0 && localLt >= (logs.lifetimeTokens || 0) * 0.9) {
      return act;
    }
    for (const [k, tokens] of Object.entries(logs.daily)) {
      const t = Number(tokens) || 0;
      if (t <= 0) continue;
      const day = act.days[k] || { tokens: 0, turns: 0, maxDurationMs: 0 };
      day.tokens = Math.max(day.tokens || 0, t);
      act.days[k] = day;
    }
    act.lifetimeTokens = Math.max(localLt, logs.lifetimeTokens || 0);
    act.peakTokens = Math.max(act.peakTokens || 0, logs.peakTokens || 0);
    act.longestTaskMs = Math.max(act.longestTaskMs || 0, logs.longestTaskMs || 0);
    act.totalTasks = Math.max(act.totalTasks || 0, logs.turns || 0);
    if (logs.effortCounts) {
      act.effortCounts = { ...emptyActivity().effortCounts, ...logs.effortCounts };
    }
    if (logs.skillUses && Object.keys(logs.skillUses).length) {
      act.skillUses = { ...(act.skillUses || {}), ...logs.skillUses };
    }
    act.seededFromLog = true;
    return saveActivity(act);
  } catch (err) {
    console.warn("[profile-stats] warmActivityFromLogs failed:", err?.message || err);
    return null;
  }
}

/**
 * Merge log + local activity into a Codex-like profile snapshot.
 * Never throws to the caller — always returns a full heatmap grid.
 */
async function getProfileStats() {
  try {
    let logs;
    try {
      logs = aggregateFromLogs();
    } catch (err) {
      logs = {
        source: "error",
        logPath: resolveLogPath(),
        lifetimeTokens: 0,
        peakTokens: 0,
        turns: 0,
        longestTaskMs: 0,
        daily: {},
        effortCounts: { high: 0, medium: 0, low: 0, other: 0 },
        skillUses: {},
        error: String(err.message || err),
      };
    }

    // Ensure activity.json exists once we have log data (helps future merges + debugging)
    if (logs.lifetimeTokens > 0) {
      warmActivityFromLogs(logs);
    }

    const local = loadActivity();

    // Merge daily tokens (prefer max of log vs local for each day)
    const daily = { ...(logs.daily || {}) };
    for (const [k, day] of Object.entries(local.days || {})) {
      const t = typeof day === "object" ? day.tokens || 0 : Number(day) || 0;
      daily[k] = Math.max(daily[k] || 0, t);
    }

    const lifetimeTokens = Math.max(local.lifetimeTokens || 0, logs.lifetimeTokens || 0);
    const peakTokens = Math.max(local.peakTokens || 0, logs.peakTokens || 0);
    const totalTasks = Math.max(local.totalTasks || 0, logs.turns || 0);
    const longestTaskMs = Math.max(local.longestTaskMs || 0, logs.longestTaskMs || 0);

    const localEffortTotal =
      (local.effortCounts?.high || 0) +
      (local.effortCounts?.medium || 0) +
      (local.effortCounts?.low || 0) +
      (local.effortCounts?.other || 0);
    const useEffort =
      localEffortTotal > 0
        ? local.effortCounts
        : logs.effortCounts || { high: 0, medium: 0, low: 0, other: 0 };

    const skillUses = { ...(logs.skillUses || {}) };
    for (const [k, v] of Object.entries(local.skillUses || {})) {
      skillUses[k] = Math.max(skillUses[k] || 0, v);
    }

    const daySet = new Set(
      Object.entries(daily)
        .filter(([, t]) => t > 0)
        .map(([k]) => k)
    );
    const streaks = computeStreaks(daySet);
    const heatmap = buildHeatmap(daily);
    const heatActiveDays = heatmap.filter((c) => (c.tokens || 0) > 0).length;
    const effort = effortBreakdown(useEffort || {});
    const skills = topSkills(skillUses);

    const effortTotal =
      (useEffort?.high || 0) +
      (useEffort?.medium || 0) +
      (useEffort?.low || 0) +
      (useEffort?.other || 0);
    const fastPct =
      effortTotal > 0 ? Math.round(((useEffort?.low || 0) / effortTotal) * 100) : 0;

    const hasData = lifetimeTokens > 0 || heatActiveDays > 0 || totalTasks > 0;

    const snapshot = {
      lifetimeTokens,
      lifetimeTokensLabel: formatTokensShort(lifetimeTokens),
      peakTokens,
      peakTokensLabel: formatTokensShort(peakTokens),
      longestTaskMs,
      longestTaskLabel: formatDurationShort(longestTaskMs),
      currentStreak: streaks.currentStreak,
      longestStreak: streaks.longestStreak,
      totalTasks,
      skillsDiscovered: Object.keys(skillUses).length,
      skillsUsedTotal: Object.values(skillUses).reduce((a, b) => a + b, 0),
      topSkills: skills,
      fastModePercent: fastPct,
      reasoning: effort,
      heatmap,
      heatmapMonths: heatmapMonthLabels(heatmap),
      heatmapWeeks: Math.ceil(heatmap.length / 7) || 0,
      heatActiveDays,
      hasData,
      sources: {
        log: logs.source,
        logPath: logs.logPath,
        local: Boolean(local.updatedAt),
        localPath: activityPath(),
        logTurns: logs.turns || 0,
        logLifetimeTokens: logs.lifetimeTokens || 0,
        logError: logs.error || null,
      },
      fetchedAt: new Date().toISOString(),
    };

    if (process.env.GROK_DEBUG_PROFILE === "1") {
      console.log(
        "[profile-stats]",
        JSON.stringify({
          lifetimeTokens: snapshot.lifetimeTokens,
          heatActiveDays: snapshot.heatActiveDays,
          heatmapLen: snapshot.heatmap.length,
          weeks: snapshot.heatmapWeeks,
          log: snapshot.sources.log,
          logTurns: snapshot.sources.logTurns,
          logPath: snapshot.sources.logPath,
        })
      );
    }

    return snapshot;
  } catch (err) {
    console.warn("[profile-stats] getProfileStats failed:", err?.message || err);
    return emptyProfileStats({ error: String(err.message || err) });
  }
}

module.exports = {
  getProfileStats,
  recordTurnActivity,
  loadActivity,
  formatTokensShort,
  formatDurationShort,
  activityPath,
  aggregateFromLogs,
  buildHeatmap,
  emptyProfileStats,
  warmActivityFromLogs,
  resolveLogPath,
  tokensSince,
  latestInferenceFromLog,
};
