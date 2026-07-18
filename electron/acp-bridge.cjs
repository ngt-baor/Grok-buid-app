const { spawn } = require("node:child_process");
const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");

/**
 * Normalize prompt input into ACP ContentBlock[].
 * Accepts plain string, content-block array, or
 * { text, images?, files? }.
 *
 * - image: { type: "image", mimeType, data } (base64)
 * - text file: { type: "resource", resource: { uri, mimeType, text } }
 * - binary file: { type: "resource", resource: { uri, mimeType, blob } }
 */
function normalizePromptBlocks(payload) {
  if (typeof payload === "string") {
    const text = payload.trim();
    return text ? [{ type: "text", text }] : [];
  }

  if (Array.isArray(payload)) {
    return payload.filter(Boolean);
  }

  if (payload && typeof payload === "object") {
    const blocks = [];
    const text = typeof payload.text === "string" ? payload.text.trim() : "";
    if (text) blocks.push({ type: "text", text });

    const images = Array.isArray(payload.images) ? payload.images : [];
    for (const img of images) {
      if (!img || !img.data) continue;
      const mimeType = String(img.mimeType || "image/png");
      const data = String(img.data).replace(/^data:[^;]+;base64,/, "");
      if (!data) continue;
      blocks.push({ type: "image", mimeType, data });
    }

    const files = Array.isArray(payload.files) ? payload.files : [];
    for (const f of files) {
      if (!f) continue;
      const name = String(f.name || "file");
      const uri = String(f.uri || f.path || `file:///${encodeURIComponent(name)}`);
      const mimeType = String(f.mimeType || "application/octet-stream");
      if (typeof f.text === "string") {
        blocks.push({
          type: "resource",
          resource: { uri, mimeType, text: f.text },
        });
      } else if (f.data || f.blob) {
        const blob = String(f.data || f.blob).replace(/^data:[^;]+;base64,/, "");
        if (!blob) continue;
        blocks.push({
          type: "resource",
          resource: { uri, mimeType, blob },
        });
      } else if (f.path) {
        // Path-only reference for agent to read via tools
        blocks.push({
          type: "resource_link",
          uri: f.path.startsWith("file:") ? f.path : `file://${f.path.replace(/\\/g, "/")}`,
          name,
          mimeType,
          size: f.size || undefined,
        });
      }
    }

    // If only attachments and no text, add a short instruction
    if (
      blocks.length > 0 &&
      !blocks.some((b) => b.type === "text") &&
      (images.length || files.length)
    ) {
      blocks.unshift({
        type: "text",
        text: "Please review the attached image(s)/file(s) and respond accordingly.",
      });
    }

    return blocks;
  }

  return [];
}

/**
 * JSON-RPC ACP client for `grok agent stdio`.
 * Protocol: https://agentclientprotocol.com + Grok agent mode docs.
 */
class AcpBridge extends EventEmitter {
  constructor({
    grokPath,
    cwd,
    model = "",
    alwaysApprove = false,
    reasoningEffort = "",
    /** @type {Array<{name:string, command:string, args?:string[], env?: Array<{name:string,value:string}>}>} */
    mcpServers = [],
  }) {
    super();
    this.grokPath = grokPath;
    this.cwd = cwd;
    this.model = model;
    this.alwaysApprove = alwaysApprove;
    this.reasoningEffort = reasoningEffort;
    this.mcpServers = Array.isArray(mcpServers) ? mcpServers : [];
    this.proc = null;
    this.rl = null;
    this.nextId = 1;
    this.pending = new Map();
    this.sessionId = null;
    this.ready = false;
    this.bufferStderr = "";
    /** @type {Map<string, string>} path -> previous content for diffs */
    this.fileSnapshots = new Map();
  }

  /**
   * ACP session/new payload: cwd + mcpServers (stdio transport).
   * @param {string} [cwd]
   */
  _sessionParams(cwd) {
    const resolved = path.resolve(cwd || this.cwd || process.cwd());
    return {
      cwd: resolved,
      mcpServers: this.mcpServers || [],
    };
  }

  /** Update MCP servers for the next session/new (does not reconnect live MCP mid-session). */
  setMcpServers(servers) {
    this.mcpServers = Array.isArray(servers) ? servers : [];
  }

  start() {
    if (this.proc) return Promise.resolve();

    const args = ["agent"];
    if (this.model) args.push("-m", this.model);
    if (this.reasoningEffort) args.push("--reasoning-effort", this.reasoningEffort);
    if (this.alwaysApprove) args.push("--always-approve");
    args.push("stdio");

    this.emit("status", { state: "starting", args, cwd: this.cwd, grokPath: this.grokPath });

    this.proc = spawn(this.grokPath, args, {
      cwd: this.cwd || undefined,
      env: { ...process.env },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });

    this.rl = readline.createInterface({ input: this.proc.stdout });
    this.rl.on("line", (line) => this._onLine(line));

    this.proc.stderr.on("data", (buf) => {
      const text = buf.toString("utf8");
      this.bufferStderr += text;
      this.emit("stderr", text);
    });

    this.proc.on("error", (err) => {
      this.emit("error", err);
      this._rejectAll(err);
    });

    this.proc.on("exit", (code, signal) => {
      this.emit("exit", { code, signal });
      this.ready = false;
      this.sessionId = null;
      this.proc = null;
      this._rejectAll(new Error(`Grok agent exited (code=${code}, signal=${signal})`));
    });

    return this._handshake();
  }

  async _handshake() {
    const initResult = await this.request("initialize", {
      protocolVersion: 1,
      clientInfo: {
        name: "grok-build-app",
        version: "0.1.8",
      },
      clientCapabilities: {
        fs: { readTextFile: true, writeTextFile: true },
        terminal: true,
      },
    });

    this.emit("initialized", initResult);

    const sessionParams = this._sessionParams(this.cwd);
    this.emit("status", {
      state: "session_new",
      cwd: sessionParams.cwd,
      mcpServers: (sessionParams.mcpServers || []).map((s) => s.name),
    });
    const session = await this.request("session/new", sessionParams);

    this.sessionId = session.sessionId || session.session_id || session.id;
    this.ready = true;
    this.emit("session", {
      sessionId: this.sessionId,
      result: session,
      mcpServers: (sessionParams.mcpServers || []).map((s) => s.name),
    });
    return {
      initResult,
      sessionId: this.sessionId,
      mcpServers: sessionParams.mcpServers || [],
    };
  }

  async newSession(cwd) {
    if (cwd) this.cwd = cwd;
    const sessionParams = this._sessionParams(this.cwd);
    this.emit("status", {
      state: "session_new",
      cwd: sessionParams.cwd,
      mcpServers: (sessionParams.mcpServers || []).map((s) => s.name),
    });
    const session = await this.request("session/new", sessionParams);
    this.sessionId = session.sessionId || session.session_id || session.id;
    this.emit("session", {
      sessionId: this.sessionId,
      result: session,
      mcpServers: (sessionParams.mcpServers || []).map((s) => s.name),
    });
    return this.sessionId;
  }

  /**
   * @param {string | Array<{type:string, text?:string, mimeType?:string, data?:string}> | {text?:string, images?: Array<{mimeType:string, data:string}>}} payload
   */
  async prompt(payload) {
    if (!this.ready || !this.sessionId) {
      throw new Error("ACP session not ready. Open a project first.");
    }

    const blocks = normalizePromptBlocks(payload);
    if (!blocks.length) {
      throw new Error("Prompt trống");
    }

    return this.request("session/prompt", {
      sessionId: this.sessionId,
      prompt: blocks,
    });
  }

  cancel() {
    if (!this.sessionId || !this.proc) return;
    // notification — no id / no response
    this._write({
      jsonrpc: "2.0",
      method: "session/cancel",
      params: { sessionId: this.sessionId },
    });
  }

  request(method, params = {}) {
    const id = this.nextId++;
    const payload = { jsonrpc: "2.0", id, method, params };
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, method });
      try {
        this._write(payload);
      } catch (err) {
        this.pending.delete(id);
        reject(err);
      }
    });
  }

  respond(id, result) {
    this._write({ jsonrpc: "2.0", id, result });
  }

  respondError(id, code, message) {
    this._write({
      jsonrpc: "2.0",
      id,
      error: { code, message },
    });
  }

  stop() {
    if (!this.proc) return;
    try {
      this.proc.kill();
    } catch {
      /* ignore */
    }
    this.proc = null;
    this.ready = false;
    this.sessionId = null;
  }

  _write(obj) {
    if (!this.proc?.stdin?.writable) {
      throw new Error("Grok agent stdin is not writable");
    }
    this.proc.stdin.write(JSON.stringify(obj) + "\n");
  }

  _onLine(line) {
    const trimmed = line.trim();
    if (!trimmed) return;

    let msg;
    try {
      msg = JSON.parse(trimmed);
    } catch {
      this.emit("raw", trimmed);
      return;
    }

    // Response to our request
    if (Object.prototype.hasOwnProperty.call(msg, "id") && (msg.result !== undefined || msg.error)) {
      const pending = this.pending.get(msg.id);
      if (pending) {
        this.pending.delete(msg.id);
        if (msg.error) {
          pending.reject(new Error(msg.error.message || JSON.stringify(msg.error)));
        } else {
          pending.resolve(msg.result ?? {});
        }
      }
      return;
    }

    // Server request (permission, fs, terminal...)
    if (msg.method && Object.prototype.hasOwnProperty.call(msg, "id")) {
      this._handleServerRequest(msg);
      return;
    }

    // Notification
    if (msg.method) {
      this._handleNotification(msg);
    }
  }

  _handleNotification(msg) {
    const method = msg.method;
    const params = msg.params || {};

    if (method === "session/update" || method === "x.ai/session/update") {
      const update = params.update || params.sessionUpdate || params;
      this.emit("update", {
        sessionId: params.sessionId || this.sessionId,
        update,
        raw: params,
      });
      return;
    }

    this.emit("notification", { method, params });
  }

  _handleServerRequest(msg) {
    const { id, method, params } = msg;

    if (method === "session/request_permission") {
      this.emit("permission", {
        id,
        params,
        respond: (optionId) => {
          // ACP typically expects { outcome: { outcome: "selected", optionId } } or similar
          this.respond(id, {
            outcome: {
              outcome: "selected",
              optionId: optionId || "allow-once",
            },
          });
        },
        deny: () => {
          this.respond(id, {
            outcome: { outcome: "cancelled" },
          });
        },
      });
      return;
    }

    if (method === "fs/read_text_file") {
      this._fsRead(id, params).catch((err) => {
        this.respondError(id, -32000, String(err.message || err));
      });
      return;
    }

    if (method === "fs/write_text_file") {
      this._fsWrite(id, params).catch((err) => {
        this.respondError(id, -32000, String(err.message || err));
      });
      return;
    }

    // Unknown server request — deny safely
    this.emit("server-request", { id, method, params });
    this.respondError(id, -32601, `Method not implemented by client: ${method}`);
  }

  async _fsRead(id, params) {
    const filePath = params.path || params.filePath;
    if (!filePath || !path.isAbsolute(filePath)) {
      throw new Error("fs/read_text_file requires absolute path");
    }
    // Constrain reads to project when cwd set
    if (this.cwd) {
      const root = path.resolve(this.cwd);
      const resolved = path.resolve(filePath);
      if (!resolved.startsWith(root + path.sep) && resolved !== root) {
        throw new Error("Read blocked outside project cwd");
      }
    }
    const content = fs.readFileSync(filePath, "utf8");
    this.fileSnapshots.set(path.resolve(filePath), content);
    // Some ACP variants return { content }, others { text }
    this.respond(id, { content, text: content });
  }

  async _fsWrite(id, params) {
    const filePath = params.path || params.filePath;
    const content = params.content ?? params.text ?? "";
    if (!filePath || !path.isAbsolute(filePath)) {
      throw new Error("fs/write_text_file requires absolute path");
    }
    const resolved = path.resolve(filePath);
    if (this.cwd) {
      const root = path.resolve(this.cwd);
      if (!resolved.startsWith(root + path.sep) && resolved !== root) {
        throw new Error("Write blocked outside project cwd");
      }
    }
    let before = this.fileSnapshots.get(resolved) || "";
    if (!before && fs.existsSync(resolved)) {
      try {
        before = fs.readFileSync(resolved, "utf8");
      } catch {
        before = "";
      }
    }
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, content, "utf8");
    this.fileSnapshots.set(resolved, String(content));
    this.emit("diff", {
      path: resolved,
      before,
      after: String(content),
    });
    this.respond(id, {});
  }

  _rejectAll(err) {
    for (const [, p] of this.pending) p.reject(err);
    this.pending.clear();
  }
}

module.exports = { AcpBridge };
