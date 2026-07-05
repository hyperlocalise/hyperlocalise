import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import {
  readRecentProjectIds,
  recordRecentProject,
  resolveRecentProjects,
} from "./recent-projects";

describe("recent-projects", () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    storage.clear();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("records and resolves recent projects in recency order", () => {
    recordRecentProject("acme", "project_b");
    recordRecentProject("acme", "project_a");
    recordRecentProject("acme", "project_c");

    expect(readRecentProjectIds("acme")).toEqual(["project_c", "project_a", "project_b"]);
    expect(
      resolveRecentProjects("acme", [
        { id: "project_a", name: "Alpha" },
        { id: "project_c", name: "Charlie" },
      ]),
    ).toEqual([
      { id: "project_c", name: "Charlie" },
      { id: "project_a", name: "Alpha" },
    ]);
  });
});
