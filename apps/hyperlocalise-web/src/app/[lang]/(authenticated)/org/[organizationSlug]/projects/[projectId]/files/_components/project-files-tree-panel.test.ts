// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { fetchProjectFiles, PROJECT_FILES_PAGE_SIZE } from "./project-files-tree-panel";
import { TREE_HEIGHT_PX } from "./project-files-tree";

describe("project files browser capacity", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requests 500 files by default", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ files: [] }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await fetchProjectFiles("acme", "proj_1");

    expect(PROJECT_FILES_PAGE_SIZE).toBe(500);
    expect(fetchMock).toHaveBeenCalledWith("/api/orgs/acme/projects/proj_1/files?limit=500", {
      method: "GET",
    });
  });

  it("uses a 480 pixel tree viewport", () => {
    expect(TREE_HEIGHT_PX).toBe(480);
  });
});
