import { readFile } from "fs/promises";
import { homedir } from "os";

const WORKSPACES_LUA = `${homedir()}/.config/nvim/lua/myWorkspaces.lua`;

export interface Workspace {
  name: string;
  /** All paths listed in this workspace (tilde-expanded). */
  paths: string[];
  /** First directory-looking path — used as the cwd when opening in Neovide. */
  rootPath: string;
}

function expandTilde(p: string): string {
  return p.startsWith("~/") ? homedir() + p.slice(1) : p === "~" ? homedir() : p;
}

/**
 * Parse myWorkspaces.lua without a Lua runtime.
 *
 * Strategy:
 *  1. Strip comments and split on top-level workspace blocks.
 *  2. Extract `name = "..."` from each block.
 *  3. Extract all path strings (`path = "..."` tables and bare `"..."` entries)
 *     from the paths array; skip single-word exclude strings.
 */
export async function loadWorkspaces(): Promise<Workspace[]> {
  const src = await readFile(WORKSPACES_LUA, "utf-8");

  // Strip line comments
  const noComments = src.replace(/--[^\n]*/g, "");

  const workspaces: Workspace[] = [];

  // Match each top-level { name = "...", paths = { ... } } block
  const blockRe = /\{\s*name\s*=\s*"([^"]+)"[\s\S]*?paths\s*=\s*\{([\s\S]*?)\}\s*,?\s*\}/g;
  let m: RegExpExecArray | null;

  while ((m = blockRe.exec(noComments)) !== null) {
    const name = m[1];
    const pathsBlock = m[2];

    // Collect all quoted strings inside the paths block.
    // A path looks like ~ or / — exclude values are plain words without slashes.
    const allStrings: string[] = [];
    const strRe = /"([^"]+)"/g;
    let sm: RegExpExecArray | null;
    while ((sm = strRe.exec(pathsBlock)) !== null) {
      const s = sm[1];
      // Keep only tilde-paths or absolute paths; skip short exclude words
      if (s.startsWith("~") || s.startsWith("/")) {
        allStrings.push(expandTilde(s));
      }
    }

    if (allStrings.length === 0) continue;

    // rootPath: first entry that looks like a directory (no extension, or ends with /)
    const rootPath =
      allStrings.find((p) => !p.includes(".") || p.endsWith("/")) ?? allStrings[0];

    workspaces.push({ name, paths: allStrings, rootPath });
  }

  return workspaces;
}
