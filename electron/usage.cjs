const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const readline = require("node:readline");
const https = require("node:https");
const { getValidAccessToken } = require("./auth.cjs");

const PROXY_HOST = "cli-chat-proxy.grok.com";
const FIVE_H_MS = 5 * 60 * 60 * 1000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function num(v) {
  if (v == null) return null;
  if (typeof v === "number") return v;
  if (typeof v === "object" && v.val != null) return Number(v.val);
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function httpsGetJson(pathname, token) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: PROXY_HOST,
        path: pathname,
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "X-XAI-Token-Auth": "xai-grok-cli",
          Accept: "application/json",
          "User-Agent": "grok-build-app/0.2.0",
          "x-grok-client-version": "0.2.93",
        },
      },
      (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 300)}`));
            return;
          }
          try {
            resolve(JSON.parse(body || "{}"));
          } catch (err) {
            reject(err);
          }
        });
      }
    );
    req.on("error", reject);
    req.setTimeout(15000, () => req.destroy(new Error("timeout")));
    req.end();
  });
}

async function fetchBilling() {
  const auth = await getValidAccessToken();
  const data = await httpsGetJson("/v1/billing", auth.token);
  const cfg = data?.config || data || {};
  const limit = num(cfg.monthlyLimit) ?? num(cfg.limit);
  const used = num(cfg.used) ?? num(cfg.includedUsed) ?? 0;
  const remaining = limit != null ? Math.max(0, limit - used) : null;
  const usedPercent = limit ? Math.min(100, (used / limit) * 100) : null;
  return {
    source: "cli-chat-proxy/v1/billing",
    periodStart: cfg.billingPeriodStart || null,
    periodEnd: cfg.billingPeriodEnd || null,
    limit,
    used,
    remaining,
    usedPercent,
    remainingPercent: usedPercent != null ? Math.max(0, 100 - usedPercent) : null,
    onDemandCap: num(cfg.onDemandCap),
    onDemandUsed: num(cfg.onDemandUsed),
    unit: "credits",
    note: "Quota credit chính thức từ Grok Build billing API (không phải raw token).",
    fetchedAt: new Date().toISOString(),
    raw: cfg,
  };
}

async function fetchModels() {
  const auth = await getValidAccessToken();
  const data = await httpsGetJson("/v1/models", auth.token);
  const list = Array.isArray(data?.data) ? data.data : [];
  return list.map((m) => ({
    id: m.id || m.model,
    name: m.name || m.id,
    description: m.description || "",
    contextWindow: m.context_window || null,
    supportsReasoningEffort: Boolean(m.supports_reasoning_effort),
    reasoningEfforts: m.reasoning_efforts || [],
    default: m.id === "grok-4.5",
    agentType: m.agent_type || null,
  }));
}

/**
 * Parse real inference token usage from ~/.grok/logs/unified.jsonl
 * Events: shell.turn.inference_done with prompt_tokens / completion_tokens / reasoning_tokens
 */
async function aggregateLogTokens() {
  const logPath = path.join(os.homedir(), ".grok", "logs", "unified.jsonl");
  const empty = () => ({
    turns: 0,
    promptTokens: 0,
    completionTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
    cachedPromptTokens: 0,
  });

  const five = empty();
  const week = empty();

  if (!fs.existsSync(logPath)) {
    return { fiveHour: five, week, logPath, source: "missing-log" };
  }

  const now = Date.now();
  const cut5 = now - FIVE_H_MS;
  const cutW = now - WEEK_MS;

  // Only read last ~12MB for performance
  const stat = fs.statSync(logPath);
  const start = Math.max(0, stat.size - 12 * 1024 * 1024);
  const stream = fs.createReadStream(logPath, { start, encoding: "utf8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let firstPartialSkipped = start > 0;

  for await (const line of rl) {
    if (firstPartialSkipped) {
      firstPartialSkipped = false;
      continue; // first line may be partial after byte seek
    }
    if (!line.includes("inference_done")) continue;
    let j;
    try {
      j = JSON.parse(line);
    } catch {
      continue;
    }
    if (j.msg !== "shell.turn.inference_done" || !j.ctx) continue;
    const ts = Date.parse(j.ts);
    if (!Number.isFinite(ts)) continue;

    const pt = Number(j.ctx.prompt_tokens) || 0;
    const ct = Number(j.ctx.completion_tokens) || 0;
    const rt = Number(j.ctx.reasoning_tokens) || 0;
    const cached = Number(j.ctx.cached_prompt_tokens) || 0;
    // billable-ish total: completion + non-cached prompt approximation
    const total = pt + ct;

    const add = (bucket) => {
      bucket.turns += 1;
      bucket.promptTokens += pt;
      bucket.completionTokens += ct;
      bucket.reasoningTokens += rt;
      bucket.cachedPromptTokens += cached;
      bucket.totalTokens += total;
    };

    if (ts >= cutW) add(week);
    if (ts >= cut5) add(five);
  }

  return {
    fiveHour: five,
    week,
    logPath,
    source: "unified.jsonl",
    note: "Token thật từ Grok CLI inference logs (prompt+completion mỗi turn).",
  };
}

// App-session context tracker (last inference + accumulators for full multi-loop turn)
let lastContext = {
  promptTokens: 0,
  completionTokens: 0,
  reasoningTokens: 0,
  cachedPromptTokens: 0,
  contextWindow: 500000,
  updatedAt: null,
};

/** Sum of inference tokens within the current agent turn (multi-loop). */
let turnAccum = {
  promptTokens: 0,
  completionTokens: 0,
  reasoningTokens: 0,
  cachedPromptTokens: 0,
  inferences: 0,
};

function setContextWindow(n) {
  if (n && n > 0) lastContext.contextWindow = n;
}

function beginTurnUsage() {
  turnAccum = {
    promptTokens: 0,
    completionTokens: 0,
    reasoningTokens: 0,
    cachedPromptTokens: 0,
    inferences: 0,
  };
}

function recordInferenceUsage(usage) {
  if (!usage) return getContextSnapshot();
  const pt = Number(usage.promptTokens || usage.prompt_tokens || 0);
  const ct = Number(usage.completionTokens || usage.completion_tokens || 0);
  const rt = Number(usage.reasoningTokens || usage.reasoning_tokens || 0);
  const cached = Number(usage.cachedPromptTokens || usage.cached_prompt_tokens || 0);
  lastContext = {
    ...lastContext,
    promptTokens: pt,
    completionTokens: ct,
    reasoningTokens: rt,
    cachedPromptTokens: cached,
    updatedAt: new Date().toISOString(),
  };
  // Accumulate every inference loop so profile tokens reflect the full turn
  turnAccum.promptTokens += pt;
  turnAccum.completionTokens += ct;
  turnAccum.reasoningTokens += rt;
  turnAccum.cachedPromptTokens += cached;
  turnAccum.inferences += 1;
  return getContextSnapshot();
}

function getContextSnapshot() {
  const used = lastContext.promptTokens || 0;
  const window = lastContext.contextWindow || 500000;
  const percent = Math.min(100, (used / window) * 100);
  return {
    ...lastContext,
    contextWindow: window,
    usedPercent: percent,
    remainingPercent: Math.max(0, 100 - percent),
    /** Full multi-loop turn totals (for profile recording). */
    turnPromptTokens: turnAccum.promptTokens,
    turnCompletionTokens: turnAccum.completionTokens,
    turnReasoningTokens: turnAccum.reasoningTokens,
    turnTotalTokens:
      turnAccum.promptTokens +
      turnAccum.completionTokens +
      (turnAccum.reasoningTokens > 0 && turnAccum.completionTokens === 0
        ? turnAccum.reasoningTokens
        : 0),
    turnInferences: turnAccum.inferences,
  };
}

/**
 * Snapshot + reset turn accumulators after a finished agent prompt.
 */
function consumeTurnUsage() {
  const snap = getContextSnapshot();
  const total =
    turnAccum.promptTokens +
    turnAccum.completionTokens +
    (turnAccum.reasoningTokens > 0 && turnAccum.completionTokens === 0
      ? turnAccum.reasoningTokens
      : 0);
  const out = {
    promptTokens: turnAccum.promptTokens,
    completionTokens: turnAccum.completionTokens,
    reasoningTokens: turnAccum.reasoningTokens,
    totalTokens: total,
    inferences: turnAccum.inferences,
    context: snap,
  };
  beginTurnUsage();
  return out;
}

async function getUsageSnapshot() {
  let billing = null;
  let billingError = null;
  try {
    billing = await fetchBilling();
  } catch (err) {
    billingError = String(err.message || err);
  }

  let tokens = null;
  let tokensError = null;
  try {
    tokens = await aggregateLogTokens();
  } catch (err) {
    tokensError = String(err.message || err);
  }

  const five = tokens?.fiveHour || {
    turns: 0,
    promptTokens: 0,
    completionTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
  };
  const week = tokens?.week || five;

  return {
    // Real billing credits (period — typically monthly for Grok Build)
    credits: billing
      ? {
          window: "billing-period",
          label: "Credits (kỳ billing)",
          used: billing.used,
          limit: billing.limit,
          remaining: billing.remaining,
          remainingPercent: billing.remainingPercent,
          usedPercent: billing.usedPercent,
          periodStart: billing.periodStart,
          periodEnd: billing.periodEnd,
          unit: "credits",
          source: billing.source,
          note: billing.note,
        }
      : null,

    // Real tokens consumed in rolling windows (from CLI logs)
    fiveHour: {
      window: "5h",
      label: "Token 5 giờ",
      used: five.totalTokens,
      promptTokens: five.promptTokens,
      completionTokens: five.completionTokens,
      reasoningTokens: five.reasoningTokens,
      turns: five.turns,
      // No official 5h cap from API — show usage only; bar uses soft scale for viz
      softLimit: null,
      remaining: null,
      remainingPercent: null,
      unit: "tokens",
      source: tokens?.source || "log",
      note: "Token inference thật (prompt+completion) trong 5h qua từ ~/.grok/logs.",
    },

    week: {
      window: "7d",
      label: "Token 7 ngày",
      used: week.totalTokens,
      promptTokens: week.promptTokens,
      completionTokens: week.completionTokens,
      reasoningTokens: week.reasoningTokens,
      turns: week.turns,
      softLimit: null,
      remaining: null,
      remainingPercent: null,
      unit: "tokens",
      source: tokens?.source || "log",
      note: "Token inference thật trong 7 ngày qua từ ~/.grok/logs.",
    },

    context: getContextSnapshot(),
    billing,
    errors: {
      billing: billingError,
      tokens: tokensError,
    },
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Pull token usage from nested ACP / session update payloads.
 * Grok may place usage under several shapes; walk common paths.
 */
function extractUsageFromPayload(payload) {
  if (!payload || typeof payload !== "object") return null;
  const candidates = [
    payload.usage,
    payload.tokenUsage,
    payload.token_usage,
    payload._meta?.usage,
    payload.meta?.usage,
    payload.update?.usage,
    payload.update?.tokenUsage,
    payload.update?._meta?.usage,
    payload.sessionUpdate?.usage,
    payload.raw?.usage,
    payload.params?.usage,
    payload.result?.usage,
  ];
  for (const u of candidates) {
    if (!u || typeof u !== "object") continue;
    const pt = num(u.promptTokens ?? u.prompt_tokens);
    const ct = num(u.completionTokens ?? u.completion_tokens);
    const rt = num(u.reasoningTokens ?? u.reasoning_tokens);
    const total = num(u.totalTokens ?? u.total_tokens);
    if (pt != null || ct != null || rt != null || total != null) {
      return {
        promptTokens: pt || 0,
        completionTokens: ct || 0,
        reasoningTokens: rt || 0,
        cachedPromptTokens:
          num(u.cachedPromptTokens ?? u.cached_prompt_tokens) || 0,
        totalTokens: total,
      };
    }
  }
  // Flat fields on the object itself
  const pt = num(payload.promptTokens ?? payload.prompt_tokens);
  const ct = num(payload.completionTokens ?? payload.completion_tokens);
  if (pt != null || ct != null) {
    return {
      promptTokens: pt || 0,
      completionTokens: ct || 0,
      reasoningTokens: num(payload.reasoningTokens ?? payload.reasoning_tokens) || 0,
      cachedPromptTokens:
        num(payload.cachedPromptTokens ?? payload.cached_prompt_tokens) || 0,
    };
  }
  return null;
}

module.exports = {
  fetchBilling,
  fetchModels,
  aggregateLogTokens,
  getUsageSnapshot,
  recordInferenceUsage,
  setContextWindow,
  getContextSnapshot,
  beginTurnUsage,
  consumeTurnUsage,
  extractUsageFromPayload,
};
