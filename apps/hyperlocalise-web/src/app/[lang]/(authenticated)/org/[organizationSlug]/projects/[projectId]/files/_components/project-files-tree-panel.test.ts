// @vitest-environment happy-dom

import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { ProjectFileRecord } from "@/api/routes/project/project.schema";

import { createProjectFileRecord } from "./project-files.fixture";
import {
  fetchProjectFiles,
  findCachedProjectFiles,
  PROJECT_FILES_PAGE_SIZE,
  projectFilesQueryKey,
} from "./project-files-tree-panel";
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

  it("does not reuse another branch cache entry as placeholder data", () => {
    const queryClient = new QueryClient();
    const mainFiles: ProjectFileRecord[] = [
      createProjectFileRecord({ sourcePath: "main/home.json" }),
    ];
    const featureFiles: ProjectFileRecord[] = [
      createProjectFileRecord({ sourcePath: "feature/checkout.json" }),
    ];

    queryClient.setQueryData(
      projectFilesQueryKey("acme", "proj_1", undefined, "main"),
      mainFiles,
    );
    queryClient.setQueryData(
      projectFilesQueryKey("acme", "proj_1", undefined, "feature"),
      featureFiles,
    );

    expect(findCachedProjectFiles(queryClient, "acme", "proj_1", "feature")).toEqual(featureFiles);
    expect(findCachedProjectFiles(queryClient, "acme", "proj_1", "new-branch")).toBeUndefined();
  });
});
