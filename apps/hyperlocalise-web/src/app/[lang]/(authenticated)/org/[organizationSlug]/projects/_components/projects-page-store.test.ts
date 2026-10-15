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

import { afterEach, describe, expect, it } from "vite-plus/test";

import { mapProjectToListRow } from "./project-list";
import { PROJECTS_PAGE_SIZE } from "./projects-table";
import { ProjectsPageStore } from "./projects-page-store";
import { recordRecentProjectVisit } from "./recent-projects";

function createRow(id: string, name: string) {
  return mapProjectToListRow({ id, name });
}

describe("ProjectsPageStore", () => {
  afterEach(() => window.localStorage.clear());

  it("filters by name or id and resets pagination when search or source changes", () => {
    const store = new ProjectsPageStore("acme");
    const projects = [
      createRow("project_alpha", "Marketing Site"),
      createRow("project_docs", "Product Docs"),
    ];

    store.loadMoreNativeProjects();
    store.loadMoreTmsProjects();
    expect(store.nativeVisibleCount).toBe(PROJECTS_PAGE_SIZE * 2);
    expect(store.tmsVisibleCount).toBe(PROJECTS_PAGE_SIZE * 2);

    store.setSearchQuery("product");
    expect(store.filterProjects(projects).map((project) => project.id)).toEqual(["project_docs"]);
    expect(store.nativeVisibleCount).toBe(PROJECTS_PAGE_SIZE);
    expect(store.tmsVisibleCount).toBe(PROJECTS_PAGE_SIZE);

    store.loadMoreNativeProjects();
    store.setSourceFilter("native");
    expect(store.sourceFilter).toBe("native");
    expect(store.nativeVisibleCount).toBe(PROJECTS_PAGE_SIZE);
  });

  it("tracks create, edit, and delete dialog chrome", () => {
    const store = new ProjectsPageStore("acme");
    const project = createRow("project_alpha", "Marketing Site");

    store.openCreateProjectDialog();
    expect(store.projectDialogMode).toBe("create");
    expect(store.isProjectDialogOpen).toBe(true);
    expect(store.editingProject).toBeNull();

    store.openEditProjectDialog(project);
    expect(store.projectDialogMode).toBe("edit");
    expect(store.editingProject).toEqual(project);

    store.closeProjectDialog(true);
    expect(store.projectDialogMode).toBe("edit");

    store.closeProjectDialog(false);
    expect(store.projectDialogMode).toBeNull();
    expect(store.editingProject).toBeNull();

    store.setDeleteProject(project);
    expect(store.deleteProject).toEqual(project);
    store.setDeleteProject(null);
    expect(store.deleteProject).toBeNull();
  });

  it("resolves recent projects after a visit", () => {
    const store = new ProjectsPageStore("acme");
    const projects = [
      { id: "project_alpha", name: "Alpha" },
      { id: "project_beta", name: "Beta" },
    ];

    recordRecentProjectVisit("acme", "project_beta", { visitedAt: 1 });
    store.syncRecentProjects(projects);
    expect(store.recentProjects).toEqual([{ id: "project_beta", name: "Beta" }]);

    store.openProject("project_alpha", projects);
    expect(store.recentProjects.map((project) => project.id)).toEqual([
      "project_alpha",
      "project_beta",
    ]);
  });
});
