import { LocalStorage } from "@raycast/api";

const PINNED_KEY = "pinned-projects";

export interface PinnedProject {
  path: string;
  name: string;
}

export async function getPinnedProjects(): Promise<PinnedProject[]> {
  const raw = await LocalStorage.getItem<string>(PINNED_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function savePinnedProjects(projects: PinnedProject[]): Promise<void> {
  await LocalStorage.setItem(PINNED_KEY, JSON.stringify(projects));
}

export async function pinProject(
  project: PinnedProject,
): Promise<PinnedProject[]> {
  const pinned = await getPinnedProjects();
  if (pinned.some((p) => p.path === project.path)) return pinned;
  const next = [...pinned, project];
  await savePinnedProjects(next);
  return next;
}

export async function unpinProject(path: string): Promise<PinnedProject[]> {
  const pinned = await getPinnedProjects();
  const next = pinned.filter((p) => p.path !== path);
  await savePinnedProjects(next);
  return next;
}

export async function unpinAll(): Promise<void> {
  await savePinnedProjects([]);
}

export async function movePinnedProject(
  path: string,
  direction: "up" | "down",
): Promise<PinnedProject[]> {
  const pinned = await getPinnedProjects();
  const idx = pinned.findIndex((p) => p.path === path);
  if (idx < 0) return pinned;

  const next = [...pinned];
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= next.length) return pinned;

  [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
  await savePinnedProjects(next);
  return next;
}
