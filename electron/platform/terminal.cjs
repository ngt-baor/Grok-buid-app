/**
 * Open an external terminal at a project cwd (Windows + macOS + Linux).
 */
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

/**
 * @param {string} cmd
 * @param {string[]} args
 * @param {{ cwd?: string, shell?: boolean }} [opts]
 */
function trySpawn(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    try {
      const child = spawn(cmd, args, {
        cwd: opts.cwd,
        detached: true,
        stdio: "ignore",
        windowsHide: false,
        shell: Boolean(opts.shell),
      });
      child.on("error", reject);
      child.unref();
      resolve({ ok: true, cmd, args, cwd: opts.cwd || null });
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * @param {string} s
 */
function escapeForAppleScript(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * @param {string} s
 */
function escapeForShellDouble(s) {
  return String(s)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\$/g, "\\$")
    .replace(/`/g, "\\`");
}

/**
 * @param {string} cwd
 * @param {string} [pref] auto | terminal | iterm | wt | powershell | cmd
 */
async function openExternalTerminal(cwd, pref = "auto") {
  const resolved = path.resolve(cwd || process.cwd());
  if (!fs.existsSync(resolved)) {
    throw new Error("cwd không tồn tại");
  }

  const preference = String(pref || "auto").toLowerCase();
  /** @type {Array<() => Promise<{ok:boolean,cmd:string,args:string[],cwd?:string|null}>>} */
  const attempts = [];

  if (process.platform === "darwin") {
    const cwdEsc = escapeForShellDouble(resolved);
    const cdCmd = `cd "${cwdEsc}" && clear`;
    const cdAs = escapeForAppleScript(cdCmd);

    const openTerminalApp = () =>
      trySpawn("osascript", [
        "-e",
        `tell application "Terminal"\nactivate\ndo script "${cdAs}"\nend tell`,
      ]);

    const openIterm = () =>
      trySpawn("osascript", [
        "-e",
        [
          'tell application "iTerm"',
          "activate",
          "try",
          "  create window with default profile",
          "on error",
          "  tell current window to create tab with default profile",
          "end try",
          `tell current session of current window to write text "${cdAs}"`,
          "end tell",
        ].join("\n"),
      ]);

    if (preference === "iterm" || preference === "iterm2") {
      attempts.push(openIterm);
      attempts.push(openTerminalApp);
    } else if (preference === "terminal" || preference === "terminal.app") {
      attempts.push(openTerminalApp);
    } else {
      // auto: Terminal.app first, then iTerm, then open -a
      attempts.push(openTerminalApp);
      attempts.push(openIterm);
    }
    attempts.push(() => trySpawn("open", ["-a", "Terminal", resolved]));
  } else if (process.platform === "win32") {
    if (preference === "wt" || preference === "auto") {
      attempts.push(() => trySpawn("wt.exe", ["-d", resolved]));
      attempts.push(() => trySpawn("wt", ["-d", resolved]));
    }
    if (preference === "powershell" || preference === "auto") {
      attempts.push(() =>
        trySpawn("powershell.exe", [
          "-NoExit",
          "-Command",
          `Set-Location -LiteralPath '${resolved.replace(/'/g, "''")}'`,
        ])
      );
    }
    if (preference === "cmd" || preference === "auto") {
      attempts.push(() => trySpawn("cmd.exe", ["/k", `cd /d "${resolved}"`]));
    }
  } else {
    const terms = [
      ["gnome-terminal", ["--working-directory", resolved]],
      ["konsole", ["--workdir", resolved]],
      ["xfce4-terminal", [`--working-directory=${resolved}`]],
      ["x-terminal-emulator", []],
      ["xterm", ["-e", `cd ${JSON.stringify(resolved)} && exec $SHELL`]],
    ];
    for (const [cmd, args] of terms) {
      attempts.push(() => trySpawn(cmd, args, { cwd: resolved }));
    }
  }

  let lastErr = null;
  for (const attempt of attempts) {
    try {
      const result = await attempt();
      if (result?.ok) return { ...result, cwd: resolved };
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(
    String(lastErr?.message || lastErr || "Không mở được terminal")
  );
}

/**
 * Preferred terminal option ids for Settings UI by platform.
 * @returns {{ id: string, label: string }[]}
 */
function terminalOptions() {
  if (process.platform === "darwin") {
    return [
      { id: "auto", label: "Auto (Terminal.app)" },
      { id: "terminal", label: "Terminal.app" },
      { id: "iterm", label: "iTerm2" },
    ];
  }
  if (process.platform === "win32") {
    return [
      { id: "auto", label: "Auto (Windows Terminal)" },
      { id: "wt", label: "Windows Terminal" },
      { id: "powershell", label: "PowerShell" },
      { id: "cmd", label: "Command Prompt" },
    ];
  }
  return [{ id: "auto", label: "Auto" }];
}

module.exports = {
  openExternalTerminal,
  terminalOptions,
  trySpawn,
};
