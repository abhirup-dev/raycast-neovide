import { List, ActionPanel, Action, Icon, Color, showToast, Toast, closeMainWindow } from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { homedir } from "os";
import { execFile } from "child_process";
import { promisify } from "util";
import tildify from "tildify";

import { loadWorkspaces, type Workspace } from "./workspaces";
import { findNvimSockets, getSocketCwd, focusWindowForSocket } from "./nvim-sockets";
import { useState, useEffect } from "react";

const execFileAsync = promisify(execFile);
const NEOVIDE_BIN = "/opt/homebrew/bin/neovide";

// ─── Socket helpers (same pattern as ProjectList) ──────────────────────────

async function loadOpenSockets(): Promise<Map<string, string>> {
  const sockets = await findNvimSockets();
  const cwdMap = new Map<string, string>();
  await Promise.all(
    sockets.map(async (s) => {
      const cwd = await getSocketCwd(s);
      if (cwd) cwdMap.set(cwd, s);
    }),
  );
  return cwdMap;
}

function socketForPath(cwdMap: Map<string, string>, rootPath: string): string | null {
  const prefix = rootPath.endsWith("/") ? rootPath : rootPath + "/";
  for (const [cwd, socket] of cwdMap) {
    if (cwd === rootPath || cwd.startsWith(prefix)) return socket;
  }
  return null;
}

// ─── WorkspaceItem ─────────────────────────────────────────────────────────

function WorkspaceItem({
  workspace,
  socket,
}: {
  workspace: Workspace;
  socket: string | null;
}) {
  const prettyRoot = tildify(workspace.rootPath);
  const prettyPaths = workspace.paths.map((p) => tildify(p)).join(", ");

  const accessories: List.Item.Accessory[] = [];
  if (socket) {
    accessories.push({
      icon: { source: Icon.CircleFilled, tintColor: Color.Green },
      tooltip: "Open in Neovide",
    });
  }

  const handleOpen = async () => {
    if (socket) {
      const toast = await showToast({ style: Toast.Style.Animated, title: "Focusing window…" });
      try {
        await focusWindowForSocket(socket);
        await closeMainWindow();
        toast.style = Toast.Style.Success;
        toast.title = `Switched to ${workspace.name}`;
      } catch (err) {
        toast.style = Toast.Style.Failure;
        toast.title = "Failed to focus";
        toast.message = err instanceof Error ? err.message : String(err);
      }
    } else {
      const toast = await showToast({ style: Toast.Style.Animated, title: `Opening ${workspace.name}…` });
      try {
        await execFileAsync(NEOVIDE_BIN, ["--fork", "--", "--cmd", `cd ${workspace.rootPath}`]);
        await closeMainWindow();
        toast.style = Toast.Style.Success;
        toast.title = `Opened ${workspace.name}`;
      } catch (err) {
        toast.style = Toast.Style.Failure;
        toast.title = "Failed to open";
        toast.message = err instanceof Error ? err.message : String(err);
      }
    }
  };

  return (
    <List.Item
      title={workspace.name}
      subtitle={prettyRoot}
      icon={{ source: Icon.Layers, tintColor: socket ? Color.Green : Color.SecondaryText }}
      keywords={[workspace.name, ...workspace.paths]}
      accessories={accessories}
      detail={
        <List.Item.Detail
          metadata={
            <List.Item.Detail.Metadata>
              <List.Item.Detail.Metadata.Label title="Paths" />
              {workspace.paths.map((p) => (
                <List.Item.Detail.Metadata.Label key={p} title="" text={tildify(p)} />
              ))}
            </List.Item.Detail.Metadata>
          }
        />
      }
      actions={
        <ActionPanel>
          <ActionPanel.Section>
            <Action
              title={socket ? "Focus Window" : "Open in Neovide"}
              icon={socket ? Icon.ArrowRight : Icon.Terminal}
              onAction={handleOpen}
            />
            {socket && (
              <Action
                title="Open New Window"
                icon={Icon.Terminal}
                shortcut={{ modifiers: ["cmd", "shift"], key: "enter" }}
                onAction={async () => {
                  const toast = await showToast({ style: Toast.Style.Animated, title: `Opening ${workspace.name}…` });
                  try {
                    await execFileAsync(NEOVIDE_BIN, ["--fork", "--", "--cmd", `cd ${workspace.rootPath}`]);
                    await closeMainWindow();
                    toast.style = Toast.Style.Success;
                    toast.title = `Opened ${workspace.name}`;
                  } catch (err) {
                    toast.style = Toast.Style.Failure;
                    toast.title = "Failed";
                    toast.message = err instanceof Error ? err.message : String(err);
                  }
                }}
              />
            )}
          </ActionPanel.Section>
          <ActionPanel.Section>
            <Action.CopyToClipboard
              title="Copy Root Path"
              content={prettyRoot}
              shortcut={{ modifiers: ["cmd"], key: "." }}
            />
            <Action.CopyToClipboard
              title="Copy All Paths"
              content={prettyPaths}
              shortcut={{ modifiers: ["cmd", "shift"], key: "." }}
            />
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}

// ─── Main view ─────────────────────────────────────────────────────────────

export default function WorkspaceList() {
  const [cwdMap, setCwdMap] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    loadOpenSockets().then(setCwdMap);
  }, []);

  const { data: workspaces, isLoading } = useCachedPromise(loadWorkspaces, [], {
    initialData: [],
    keepPreviousData: true,
  });

  const openWorkspaces = workspaces.filter((w) => socketForPath(cwdMap, w.rootPath) !== null);
  const closedWorkspaces = workspaces.filter((w) => socketForPath(cwdMap, w.rootPath) === null);

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Search workspaces…"
      navigationTitle="Neovim Workspaces"
      isShowingDetail={workspaces.length > 0}
      filtering={{ keepSectionOrder: true }}
    >
      {openWorkspaces.length > 0 && (
        <List.Section title={`Open (${openWorkspaces.length})`}>
          {openWorkspaces.map((w) => (
            <WorkspaceItem key={w.name} workspace={w} socket={socketForPath(cwdMap, w.rootPath)} />
          ))}
        </List.Section>
      )}
      <List.Section title="Workspaces">
        {closedWorkspaces.map((w) => (
          <WorkspaceItem key={w.name} workspace={w} socket={null} />
        ))}
      </List.Section>
    </List>
  );
}
