/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
// @vitest-environment happy-dom

import { createElement } from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ContentEditorTestProviders } from "@/components/content-editor/shared/content-editor-test-utils";
import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { ProjectFileRecord } from "@/api/routes/project/project.schema";

import { createProjectFileRecord } from "./project-files.fixture";
import {
  ProjectFilesTreePanel,
  fetchProjectFiles,
  findCachedProjectFiles,
  PROJECT_FILES_PAGE_SIZE,
  projectFilesQueryKey,
} from "./project-files-tree-panel";
import { TREE_HEIGHT_PX } from "./project-files-tree";

vi.mock("./project-files-tree", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./project-files-tree")>();
  return { ...actual, ProjectFilesTree: ({ files }: { files: ProjectFileRecord[] }) => createElement("div", { "data-testid": "file-count" }, files.length) };
});

describe("project files browser capacity", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("preserves loaded pages without refetching when selecting an already loaded file", async () => {
    const files = Array.from({ length: 600 }, (_, index) => createProjectFileRecord({ sourcePath: `file-${String(index).padStart(4, "0")}.json` }));
    const fetchMock = vi.fn().mockImplementation(async (url: string) => new Response(JSON.stringify({ files: files.slice(0, Number(new URL(url, "http://localhost").searchParams.get("limit"))) }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const props = { organizationSlug: "acme", projectId: "proj_1", selectedSourcePath: "file-0000.json", onSelectSourcePath: vi.fn() };
    const { rerender } = render(createElement(ProjectFilesTreePanel, props), { wrapper: ContentEditorTestProviders });
    await waitFor(() => expect(screen.getByTestId("file-count")).toHaveTextContent("500"));
    fireEvent.click(screen.getByRole("button", { name: /load more/i }));
    await waitFor(() => expect(screen.getByTestId("file-count")).toHaveTextContent("600"));
    const requests = fetchMock.mock.calls.length;
    rerender(createElement(ProjectFilesTreePanel, { ...props, selectedSourcePath: "file-0599.json" }));
    await waitFor(() => expect(screen.getByTestId("file-count")).toHaveTextContent("600"));
    expect(fetchMock).toHaveBeenCalledTimes(requests);
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

    queryClient.setQueryData(projectFilesQueryKey("acme", "proj_1", undefined, "main"), mainFiles);
    queryClient.setQueryData(
      projectFilesQueryKey("acme", "proj_1", undefined, "feature"),
      featureFiles,
    );

    expect(findCachedProjectFiles(queryClient, "acme", "proj_1", "feature")).toEqual(featureFiles);
    expect(findCachedProjectFiles(queryClient, "acme", "proj_1", "new-branch")).toBeUndefined();
  });
});
