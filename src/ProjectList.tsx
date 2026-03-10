import {
  List,
  ActionPanel,
  Action,
  Icon,
  Color,
  showToast,
  Toast,
  Cache,
  closeMainWindow,
} from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { readFile, access } from "fs/promises";
import { homedir } from "os";
import { basename, dirname } from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { useEffect, useState } from "react";
import tildify from "tildify";

import {
  getPinnedProjects,
  pinProject,
  unpinProject,
  unpinAll,
  movePinnedProject,
  type PinnedProject,
} from "./pinned";
import { findNvimSockets, getSocketCwd, focusWindowForSocket } from "./nvim-sockets";
import { getGitBranch } from "./git";

const execFileAsync = promisify(execFile);

const NEOVIDE_BIN = "/opt/homebrew/bin/neovide";
const PROJECT_HISTORY = `${homedir()}/.local/share/nvim/project_nvim/project_history`;
const CACHE_KEY = "neovide-recent-projects";
const cache = new Cache();

// ─── Types ─────────────────────────────────────────────────────────────────

interface Project {
  path: string;
  name: string;
}

interface OpenProject extends Project {
  socket: string;
}

// ─── Data loading ──────────────────────────────────────────────────────────

function getInitialProjects(): Project[] {
  const raw = cache.get(CACHE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function loadProjects(): Promise<Project[]> {
  const content = await readFile(PROJECT_HISTORY, "utf-8");
  const lines = content
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .reverse(); // project_nvim: oldest first → reverse for most-recent-first

  const checked = await Promise.all(
    lines.map(async (p) => {
      try {
        await access(p);
        return p;
      } catch {
        return null;
      }
    }),
  );

  const projects = checked
    .filter((p): p is string => p !== null)
    .map((p) => ({ path: p, name: basename(p) }));
  cache.set(CACHE_KEY, JSON.stringify(projects));
  return projects;
}

/**
 * Query all running nvim sockets and return a map of cwd → socket.
 * Projects whose path matches a socket cwd (or is a parent of one) are "open".
 */
async function loadOpenSockets(): Promise<Map<string, string>> {
  const sockets = await findNvimSockets();
  const cwdMap = new Map<string, string>(); // cwd → socket

  await Promise.all(
    sockets.map(async (s) => {
      const cwd = await getSocketCwd(s);
      if (cwd) cwdMap.set(cwd, s);
    }),
  );

  return cwdMap;
}

/** Given all open sockets (cwd→socket), find the socket for a project path. */
function socketForProject(cwdMap: Map<string, string>, projectPath: string): string | null {
  const prefix = projectPath.endsWith("/") ? projectPath : projectPath + "/";
  for (const [cwd, socket] of cwdMap) {
    if (cwd === projectPath || cwd.startsWith(prefix)) return socket;
  }
  return null;
}

// ─── Actions ───────────────────────────────────────────────────────────────

async function focusProject(project: OpenProject): Promise<void> {
  const toast = await showToast({ style: Toast.Style.Animated, title: "Focusing window…" });
  try {
    await focusWindowForSocket(project.socket);
    await closeMainWindow();
    toast.style = Toast.Style.Success;
    toast.title = `Switched to ${project.name}`;
  } catch (err) {
    toast.style = Toast.Style.Failure;
    toast.title = "Failed to focus";
    toast.message = err instanceof Error ? err.message : String(err);
  }
}

async function openNewProject(project: Project): Promise<void> {
  const toast = await showToast({ style: Toast.Style.Animated, title: `Opening ${project.name}…` });
  try {
    await execFileAsync(NEOVIDE_BIN, ["--fork", "--", "--cmd", `cd ${project.path}`]);
    await closeMainWindow();
    toast.style = Toast.Style.Success;
    toast.title = `Opened ${project.name}`;
  } catch (err) {
    toast.style = Toast.Style.Failure;
    toast.title = "Failed to open";
    toast.message = err instanceof Error ? err.message : String(err);
  }
}

// ─── OpenProjectItem ───────────────────────────────────────────────────────

function OpenProjectItem({ project }: { project: OpenProject }) {
  const prettyPath = tildify(project.path);
  const subtitle = dirname(prettyPath);
  const keywords = project.path.split("/");
  const [gitBranch, setGitBranch] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    getGitBranch(project.path).then((b) => {
      if (mounted && b) setGitBranch(b);
    });
    return () => { mounted = false; };
  }, [project.path]);

  const accessories: List.Item.Accessory[] = [
    { icon: { source: Icon.CircleFilled, tintColor: Color.Green }, tooltip: "Open in Neovide" },
  ];
  if (gitBranch) {
    accessories.push({ tag: { value: gitBranch, color: Color.Green }, tooltip: `Git branch: ${gitBranch}` });
  }

  return (
    <List.Item
      title={project.name}
      subtitle={subtitle}
      icon={{ fileIcon: project.path }}
      keywords={keywords}
      accessories={accessories}
      actions={
        <ActionPanel>
          <ActionPanel.Section>
            <Action
              title="Focus Window"
              icon={Icon.ArrowRight}
              onAction={() => focusProject(project)}
            />
            <Action
              title="Open New Window"
              icon={Icon.Terminal}
              shortcut={{ modifiers: ["cmd", "shift"], key: "enter" }}
              onAction={() => openNewProject(project)}
            />
            <Action.ShowInFinder path={project.path} shortcut={{ modifiers: ["cmd"], key: "f" }} />
          </ActionPanel.Section>
          <ActionPanel.Section>
            <Action.CopyToClipboard title="Copy Path" content={prettyPath} shortcut={{ modifiers: ["cmd"], key: "." }} />
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}

// ─── ProjectItem ───────────────────────────────────────────────────────────

function ProjectItem({
  project,
  pinned,
  pinnedList,
  setPinnedList,
}: {
  project: Project;
  pinned: boolean;
  pinnedList: PinnedProject[];
  setPinnedList: (list: PinnedProject[]) => void;
}) {
  const prettyPath = tildify(project.path);
  const subtitle = dirname(prettyPath);
  const keywords = project.path.split("/");
  const [gitBranch, setGitBranch] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    getGitBranch(project.path).then((b) => {
      if (mounted && b) setGitBranch(b);
    });
    return () => { mounted = false; };
  }, [project.path]);

  const accessories: List.Item.Accessory[] = [];
  if (gitBranch) {
    accessories.push({ tag: { value: gitBranch, color: Color.Green }, tooltip: `Git branch: ${gitBranch}` });
  }

  const idx = pinnedList.findIndex((p) => p.path === project.path);
  const canMoveUp = pinned && idx > 0;
  const canMoveDown = pinned && idx < pinnedList.length - 1;

  return (
    <List.Item
      title={project.name}
      subtitle={subtitle}
      icon={{ fileIcon: project.path }}
      keywords={keywords}
      accessories={accessories}
      actions={
        <ActionPanel>
          <ActionPanel.Section>
            <Action title="Open in Neovide" icon={Icon.Terminal} onAction={() => openNewProject(project)} />
            <Action.ShowInFinder path={project.path} shortcut={{ modifiers: ["cmd"], key: "f" }} />
            <Action.OpenWith path={project.path} shortcut={{ modifiers: ["cmd"], key: "o" }} />
          </ActionPanel.Section>
          <ActionPanel.Section>
            <Action.CopyToClipboard title="Copy Name" content={project.name} shortcut={{ modifiers: ["cmd"], key: "." }} />
            <Action.CopyToClipboard title="Copy Path" content={prettyPath} shortcut={{ modifiers: ["cmd", "shift"], key: "." }} />
          </ActionPanel.Section>
          <ActionPanel.Section>
            {!pinned ? (
              <Action
                title="Pin Project"
                icon={Icon.Pin}
                shortcut={{ modifiers: ["cmd", "shift"], key: "p" }}
                onAction={async () => {
                  const next = await pinProject({ path: project.path, name: project.name });
                  setPinnedList(next);
                  await showToast({ title: "Pinned project" });
                }}
              />
            ) : (
              <>
                <Action
                  title="Unpin Project"
                  icon={Icon.PinDisabled}
                  shortcut={{ modifiers: ["cmd", "shift"], key: "p" }}
                  onAction={async () => {
                    const next = await unpinProject(project.path);
                    setPinnedList(next);
                    await showToast({ title: "Unpinned project" });
                  }}
                />
                {canMoveUp && (
                  <Action
                    title="Move Up in Pinned"
                    icon={Icon.ArrowUp}
                    shortcut={{ modifiers: ["cmd", "opt"], key: "arrowUp" }}
                    onAction={async () => {
                      const next = await movePinnedProject(project.path, "up");
                      setPinnedList(next);
                    }}
                  />
                )}
                {canMoveDown && (
                  <Action
                    title="Move Down in Pinned"
                    icon={Icon.ArrowDown}
                    shortcut={{ modifiers: ["cmd", "opt"], key: "arrowDown" }}
                    onAction={async () => {
                      const next = await movePinnedProject(project.path, "down");
                      setPinnedList(next);
                    }}
                  />
                )}
                <Action
                  title="Unpin All"
                  icon={Icon.PinDisabled}
                  style={Action.Style.Destructive}
                  shortcut={{ modifiers: ["ctrl", "shift"], key: "x" }}
                  onAction={async () => {
                    await unpinAll();
                    setPinnedList([]);
                    await showToast({ title: "Unpinned all projects" });
                  }}
                />
              </>
            )}
          </ActionPanel.Section>
          <ActionPanel.Section>
            <Action
              title="Remove from Recent Projects"
              icon={Icon.Trash}
              style={Action.Style.Destructive}
              shortcut={{ modifiers: ["ctrl"], key: "x" }}
              onAction={async () => {
                const updated = getInitialProjects().filter((p) => p.path !== project.path);
                cache.set(CACHE_KEY, JSON.stringify(updated));
                await showToast({ title: "Removed from list" });
              }}
            />
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}

// ─── Main view ─────────────────────────────────────────────────────────────

export default function ProjectList() {
  const [pinnedList, setPinnedList] = useState<PinnedProject[]>([]);
  const [cwdMap, setCwdMap] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    getPinnedProjects().then(setPinnedList);
    loadOpenSockets().then(setCwdMap);
  }, []);

  const { data: allProjects, isLoading } = useCachedPromise(loadProjects, [], {
    initialData: getInitialProjects(),
    keepPreviousData: true,
  });

  const pinnedPaths = new Set(pinnedList.map((p) => p.path));

  // Split into open / recent
  const openProjects: OpenProject[] = [];
  const recentProjects: Project[] = [];

  for (const p of allProjects ?? []) {
    if (pinnedPaths.has(p.path)) continue; // pinned section handles these
    const socket = socketForProject(cwdMap, p.path);
    if (socket) {
      openProjects.push({ ...p, socket });
    } else {
      recentProjects.push(p);
    }
  }

  return (
    <List
      isLoading={isLoading && !allProjects?.length}
      searchBarPlaceholder="Search projects…"
      navigationTitle="Neovim Projects"
      filtering={{ keepSectionOrder: true }}
    >
      <List.Section title="Pinned">
        {pinnedList.map((p) => (
          <ProjectItem
            key={`pinned-${p.path}`}
            project={p}
            pinned={true}
            pinnedList={pinnedList}
            setPinnedList={setPinnedList}
          />
        ))}
      </List.Section>
      <List.Section title={`Open (${openProjects.length})`}>
        {openProjects.map((p) => (
          <OpenProjectItem key={`open-${p.path}`} project={p} />
        ))}
      </List.Section>
      <List.Section title="Recent">
        {recentProjects.map((p) => (
          <ProjectItem
            key={p.path}
            project={p}
            pinned={false}
            pinnedList={pinnedList}
            setPinnedList={setPinnedList}
          />
        ))}
      </List.Section>
    </List>
  );
}
