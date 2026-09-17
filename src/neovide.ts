import { spawn } from "child_process";

const NEOVIDE_BIN = "/opt/homebrew/bin/neovide";

/**
 * Start Neovide without keeping the Raycast command attached to the GUI process.
 * Resolve once macOS has spawned the process, rather than when Neovide exits.
 */
export function launchNeovide(nvimArgs: string[] = []): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      NEOVIDE_BIN,
      ["--fork", ...(nvimArgs.length > 0 ? ["--", ...nvimArgs] : [])],
      {
        detached: true,
        stdio: "ignore",
      },
    );

    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}
