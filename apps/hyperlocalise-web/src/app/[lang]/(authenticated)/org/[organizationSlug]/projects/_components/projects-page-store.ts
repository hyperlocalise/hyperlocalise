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
import { makeAutoObservable } from "mobx";

import type { ProjectListRow } from "./project-list";
import { PROJECTS_PAGE_SIZE } from "./projects-table";
import { recordRecentProjectVisit, resolveRecentProjects } from "./recent-projects";

export type ProjectSourceFilter = "all" | "tms" | "native";
export type ProjectDialogMode = "create" | "edit" | null;

export class ProjectsPageStore {
  readonly organizationSlug: string;
  searchQuery = "";
  sourceFilter: ProjectSourceFilter = "all";
  projectDialogMode: ProjectDialogMode = null;
  editingProject: ProjectListRow | null = null;
  deleteProject: ProjectListRow | null = null;
  nativeVisibleCount = PROJECTS_PAGE_SIZE;
  tmsVisibleCount = PROJECTS_PAGE_SIZE;
  recentProjects: Array<{ id: string; name: string }> = [];

  constructor(organizationSlug: string) {
    this.organizationSlug = organizationSlug;
    makeAutoObservable(this, {}, { autoBind: true });
  }

  get isProjectDialogOpen() {
    return this.projectDialogMode !== null;
  }

  filterProjects<T extends { id: string; name: string }>(projects: readonly T[]): T[] {
    const query = this.searchQuery.trim().toLowerCase();
    if (!query) {
      return [...projects];
    }

    return projects.filter((project) => {
      return project.name.toLowerCase().includes(query) || project.id.toLowerCase().includes(query);
    });
  }

  setSearchQuery(searchQuery: string) {
    this.searchQuery = searchQuery;
    this.resetPagination();
  }

  setSourceFilter(sourceFilter: ProjectSourceFilter) {
    this.sourceFilter = sourceFilter;
    this.resetPagination();
  }

  resetPagination() {
    this.nativeVisibleCount = PROJECTS_PAGE_SIZE;
    this.tmsVisibleCount = PROJECTS_PAGE_SIZE;
  }

  loadMoreNativeProjects() {
    this.nativeVisibleCount += PROJECTS_PAGE_SIZE;
  }

  loadMoreTmsProjects() {
    this.tmsVisibleCount += PROJECTS_PAGE_SIZE;
  }

  openCreateProjectDialog() {
    this.editingProject = null;
    this.projectDialogMode = "create";
  }

  openEditProjectDialog(project: ProjectListRow) {
    this.editingProject = project;
    this.projectDialogMode = "edit";
  }

  closeProjectDialog(open: boolean) {
    if (open) {
      return;
    }

    this.projectDialogMode = null;
    this.editingProject = null;
  }

  setDeleteProject(project: ProjectListRow | null) {
    this.deleteProject = project;
  }

  syncRecentProjects(projects: readonly { id: string; name: string }[]) {
    this.recentProjects = resolveRecentProjects(this.organizationSlug, projects);
  }

  openProject(projectId: string, allProjects: readonly { id: string; name: string }[]) {
    recordRecentProjectVisit(this.organizationSlug, projectId);
    this.syncRecentProjects(allProjects);
  }
}
