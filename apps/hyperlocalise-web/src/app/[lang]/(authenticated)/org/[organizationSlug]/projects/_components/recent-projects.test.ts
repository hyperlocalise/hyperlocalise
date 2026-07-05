import { describe, expect, it } from "vite-plus/test";

import {
  readRecentProjectVisits,
  recordRecentProjectVisit,
  resolveRecentProjects,
} from "./recent-projects";

function createStorage() {
  const values = new Map<string, string>();
  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}

describe("recent-projects", () => {
  it("stores the latest visit first without duplicating a project", () => {
    const storage = createStorage();

    recordRecentProjectVisit("acme", "project_a", { storage, visitedAt: 10 });
    recordRecentProjectVisit("acme", "project_b", { storage, visitedAt: 20 });
    recordRecentProjectVisit("acme", "project_a", { storage, visitedAt: 30 });

    expect(readRecentProjectVisits("acme", storage)).toEqual([
      { projectId: "project_a", visitedAt: 30 },
      { projectId: "project_b", visitedAt: 20 },
    ]);
  });

  it("keeps organization histories separate and ignores invalid data", () => {
    const storage = createStorage();
    storage.setItem("hyperlocalise:recent-projects:v1:broken", "{");
    recordRecentProjectVisit("acme", "project_a", { storage, visitedAt: 10 });

    expect(readRecentProjectVisits("other", storage)).toEqual([]);
    expect(readRecentProjectVisits("broken", storage)).toEqual([]);
  });

  it("resolves recent visits to known projects in visit order", () => {
    const storage = createStorage();

    recordRecentProjectVisit("acme", "project_b", { storage, visitedAt: 10 });
    recordRecentProjectVisit("acme", "project_a", { storage, visitedAt: 20 });
    recordRecentProjectVisit("acme", "project_c", { storage, visitedAt: 30 });

    expect(
      resolveRecentProjects(
        "acme",
        [
          { id: "project_a", name: "Alpha" },
          { id: "project_c", name: "Charlie" },
        ],
        { storage },
      ),
    ).toEqual([
      { id: "project_c", name: "Charlie" },
      { id: "project_a", name: "Alpha" },
    ]);
  });
});
