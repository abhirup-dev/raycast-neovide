import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

/** Return the current git branch for a directory, or null if not a git repo. */
export async function getGitBranch(dirPath: string): Promise<string | null> {
  try {
    const { stdout } = await execAsync("git rev-parse --abbrev-ref HEAD", {
      cwd: dirPath,
      timeout: 2000,
    });
    const branch = stdout.trim();
    return branch || null;
  } catch {
    return null;
  }
}
