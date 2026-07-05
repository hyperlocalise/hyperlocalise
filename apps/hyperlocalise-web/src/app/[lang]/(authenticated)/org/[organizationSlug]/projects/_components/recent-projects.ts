const RECENT_PROJECTS_STORAGE_VERSION = 1;
const RECENT_PROJECTS_LIMIT = 20;

export type RecentProjectVisit = {
  projectId: string;
  visitedAt: number;
};

type RecentProjectsStorage = Pick<Storage, "getItem" | "setItem">;

function recentProjectsStorageKey(organizationSlug: string) {
  return `hyperlocalise:recent-projects:v${RECENT_PROJECTS_STORAGE_VERSION}:${organizationSlug}`;
}

function getBrowserStorage() {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

function isRecentProjectVisit(value: unknown): value is RecentProjectVisit {
  if (!value || typeof value !== "object") {
    return false;
  }

  const visit = value as Partial<RecentProjectVisit>;
  return (
    typeof visit.projectId === "string" &&
    visit.projectId.length > 0 &&
    typeof visit.visitedAt === "number" &&
    Number.isFinite(visit.visitedAt)
  );
}

export function readRecentProjectVisits(
  organizationSlug: string,
  storage: RecentProjectsStorage | undefined = getBrowserStorage(),
): RecentProjectVisit[] {
  if (!storage) {
    return [];
  }

  try {
    const value = storage.getItem(recentProjectsStorageKey(organizationSlug));
    if (!value) {
      return [];
    }

    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter(isRecentProjectVisit)
      .toSorted((left, right) => right.visitedAt - left.visitedAt)
      .slice(0, RECENT_PROJECTS_LIMIT);
  } catch {
    return [];
  }
}

export function recordRecentProjectVisit(
  organizationSlug: string,
  projectId: string,
  options?: {
    storage?: RecentProjectsStorage;
    visitedAt?: number;
  },
) {
  const storage = options?.storage ?? getBrowserStorage();
  if (!storage || !projectId) {
    return;
  }

  const visits = readRecentProjectVisits(organizationSlug, storage).filter(
    (visit) => visit.projectId !== projectId,
  );
  visits.unshift({
    projectId,
    visitedAt: options?.visitedAt ?? Date.now(),
  });

  try {
    storage.setItem(
      recentProjectsStorageKey(organizationSlug),
      JSON.stringify(visits.slice(0, RECENT_PROJECTS_LIMIT)),
    );
  } catch {
    // Recent history is an enhancement; navigation must still succeed.
  }
}
