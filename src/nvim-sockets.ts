import { exec, execFile } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

const LSOF = "/usr/sbin/lsof";
const NVIM = "/opt/homebrew/bin/nvim";

/**
 * Enumerate all named Unix socket paths open by running nvim processes.
 * Uses absolute path for lsof (Raycast env may have a stripped PATH).
 * Filters to only real file paths (skips unnamed ->0x... entries).
 */
export async function findNvimSockets(): Promise<string[]> {
  try {
    const { stdout } = await execAsync(
      `${LSOF} -c nvim -a -U 2>/dev/null | awk 'NR>1 && $NF ~ /^\\//{print $NF}' | sort -u`,
    );
    return stdout.trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

/** Ask a running nvim instance for its CWD via its socket. Returns null on timeout/error. */
export async function getSocketCwd(socket: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(
      NVIM,
      ["--server", socket, "--remote-expr", "getcwd()"],
      { timeout: 2000 },
    );
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Return the socket for a running nvim whose cwd equals projectPath
 * OR is a subdirectory of it (e.g. project /a/b matches cwd /a/b/src).
 */
export async function findSocketForProject(
  projectPath: string,
): Promise<string | null> {
  const sockets = await findNvimSockets();
  if (sockets.length === 0) return null;

  const prefix = projectPath.endsWith("/") ? projectPath : projectPath + "/";

  const matches = await Promise.all(
    sockets.map(async (s) => {
      const cwd = await getSocketCwd(s);
      if (!cwd) return null;
      return cwd === projectPath || cwd.startsWith(prefix) ? s : null;
    }),
  );
  return matches.find((s): s is string => s !== null) ?? null;
}

/**
 * Focus the specific Neovide window that owns a given nvim socket.
 * socket → nvim PID → parent Neovide PID → AppleScript frontmost + AXRaise.
 * Falls back to activating the Neovide app.
 */
export async function focusWindowForSocket(socket: string): Promise<void> {
  const { runAppleScript } = await import("@raycast/utils");

  try {
    // Get the nvim PID that owns this specific socket file
    const { stdout: lsofOut } = await execFileAsync(
      LSOF,
      ["-t", "--", socket],
      {
        timeout: 1000,
      },
    );
    const nvimPid = lsofOut.trim();

    if (nvimPid) {
      const { stdout: ppidOut } = await execAsync(`ps -o ppid= -p ${nvimPid}`);
      const neovideParentPid = ppidOut.trim();

      if (neovideParentPid) {
        await runAppleScript(`
          tell application "System Events"
            set procs to (every process whose unix id is ${neovideParentPid})
            if procs is not {} then
              set p to item 1 of procs
              set frontmost of p to true
              set editorWindow to missing value
              set largestArea to 0
              repeat with w in windows of p
                try
                  set windowSize to size of w
                  set windowArea to (item 1 of windowSize) * (item 2 of windowSize)
                  if windowArea > largestArea then
                    set largestArea to windowArea
                    set editorWindow to w
                  end if
                end try
              end repeat
              if editorWindow is not missing value then
                perform action "AXRaise" of editorWindow
              end if
            end if
          end tell
        `);
        return;
      }
    }
  } catch {
    // fall through
  }

  await runAppleScript(`tell application "Neovide" to activate`);
}
