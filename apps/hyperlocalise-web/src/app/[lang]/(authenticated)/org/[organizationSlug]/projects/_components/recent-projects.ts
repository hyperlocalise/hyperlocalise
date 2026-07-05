const RECENT_PROJECTS_STORAGE_VERSION = "v1";
const MAX_RECENT_PROJECTS = 5;

function storageKey(organizationSlug: string) {
  return `recent-projects:${RECENT_PROJECTS_STORAGE_VERSION}:${organizationSlug}`;
}

function getBrowserStorage(): Storage | null {
  if (typeof globalThis.localStorage === "undefined") {
    return null;
  }

  return globalThis.localStorage;
}

export function readRecentProjectIds(organizationSlug: string): string[] {
  const storage = getBrowserStorage();
  if (!storage) {
    return [];
  }

  try {
    const raw = storage.getItem(storageKey(organizationSlug));
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((value): value is string => typeof value === "string")
      .slice(0, MAX_RECENT_PROJECTS);
  } catch {
    return [];
  }
}

export function recordRecentProject(organizationSlug: string, projectId: string) {
  const storage = getBrowserStorage();
  if (!storage || !projectId.trim()) {
    return;
  }

  try {
    const existing = readRecentProjectIds(organizationSlug).filter((id) => id !== projectId);
    const next = [projectId, ...existing].slice(0, MAX_RECENT_PROJECTS);
    storage.setItem(storageKey(organizationSlug), JSON.stringify(next));
  } catch {
    // Ignore quota, private browsing, or disabled storage.
  }
}

export function resolveRecentProjects(
  organizationSlug: string,
  projects: readonly { id: string; name: string }[],
) {
  const projectsById = new Map(projects.map((project) => [project.id, project]));

  return readRecentProjectIds(organizationSlug)
    .map((id) => projectsById.get(id))
    .filter((project): project is { id: string; name: string } => project !== undefined);
}
