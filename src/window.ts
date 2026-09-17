import { closeMainWindow, showToast, Toast } from "@raycast/api";
import { runAppleScript } from "@raycast/utils";
import { launchNeovide } from "./neovide";

/**
 * Open a new blank Neovide window via AppleScript (menu bar: File → New OS Window).
 * Falls back to execFile if the menu item isn't found.
 */
export async function openNewNeovideWindow(): Promise<void> {
  try {
    await runAppleScript(`
      tell application "Neovide"
        activate
      end tell
      delay 0.4
      tell application "System Events"
        tell process "Neovide"
          click menu item "New OS Window" of menu "File" of menu bar 1
        end tell
      end tell
    `);
  } catch {
    // Fallback: spawn via CLI
    await launchNeovide();
  }
}

export async function runNewWindowCommand(): Promise<void> {
  try {
    await closeMainWindow();
    await openNewNeovideWindow();
  } catch (err) {
    await showToast({
      style: Toast.Style.Failure,
      title: "Failed to open new Neovide window",
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
