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
import type {
  CreateProjectBody,
  GoSvcRequestOptions,
  ProjectContentEditorBehavior,
  ProjectContentEditorBehaviorPreview,
  ProjectFileRecord,
  ProjectFilesQuery,
  ProjectLocaleProgressRow,
  ProjectRecord,
  UpdateProjectBody,
  WorkspaceFileRecord,
  WorkspaceFilesQuery,
} from "./go-svc-client.types";
import { orgPath, type GoSvcRequest } from "./go-svc-request";

export class GoSvcProjectApi {
  constructor(private readonly request: GoSvcRequest) {}

  list(organizationSlug: string, options: GoSvcRequestOptions = {}) {
    return this.request.json<{ projects: ProjectRecord[] }>(
      orgPath(organizationSlug, "projects"),
      options,
    );
  }

  create(organizationSlug: string, body: CreateProjectBody, options: GoSvcRequestOptions = {}) {
    return this.request.json<{ project: ProjectRecord }>(orgPath(organizationSlug, "projects"), {
      method: "POST",
      body,
      ...options,
    });
  }

  get(organizationSlug: string, projectId: string, options: GoSvcRequestOptions = {}) {
    return this.request.json<{ project: ProjectRecord }>(
      orgPath(organizationSlug, "projects", projectId),
      options,
    );
  }

  update(
    organizationSlug: string,
    projectId: string,
    body: UpdateProjectBody,
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<{ project: ProjectRecord }>(
      orgPath(organizationSlug, "projects", projectId),
      { method: "PATCH", body, ...options },
    );
  }

  delete(organizationSlug: string, projectId: string, options: GoSvcRequestOptions = {}) {
    return this.request.empty(orgPath(organizationSlug, "projects", projectId), {
      method: "DELETE",
      ...options,
    });
  }

  localeProgress(organizationSlug: string, projectId: string, options: GoSvcRequestOptions = {}) {
    return this.request.json<{ locales: ProjectLocaleProgressRow[] }>(
      orgPath(organizationSlug, "projects", projectId, "locale-progress"),
      options,
    );
  }

  openJobCount(organizationSlug: string, projectId: string, options: GoSvcRequestOptions = {}) {
    return this.request.json<{ openJobCount: number }>(
      orgPath(organizationSlug, "projects", projectId, "open-job-count"),
      options,
    );
  }

  contentEditorBehavior(
    organizationSlug: string,
    projectId: string,
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<{ contentEditorBehavior: ProjectContentEditorBehavior }>(
      orgPath(organizationSlug, "projects", projectId, "content-editor-behavior"),
      options,
    );
  }

  previewContentEditorBehavior(
    organizationSlug: string,
    projectId: string,
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<{ preview: ProjectContentEditorBehaviorPreview }>(
      orgPath(organizationSlug, "projects", projectId, "content-editor-behavior", "preview"),
      options,
    );
  }

  updateContentEditorBehavior(
    organizationSlug: string,
    projectId: string,
    body: { automaticallyGroupIdenticalStrings: boolean },
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<{ contentEditorBehavior: ProjectContentEditorBehavior }>(
      orgPath(organizationSlug, "projects", projectId, "content-editor-behavior"),
      { method: "PATCH", body, ...options },
    );
  }

  files(
    organizationSlug: string,
    projectId: string,
    query: ProjectFilesQuery = {},
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<{ files: ProjectFileRecord[] }>(
      orgPath(organizationSlug, "projects", projectId, "files"),
      { query, ...options },
    );
  }

  workspaceFiles(
    organizationSlug: string,
    query: WorkspaceFilesQuery = {},
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<{ files: WorkspaceFileRecord[] }>(
      orgPath(organizationSlug, "workspace-files"),
      { query, ...options },
    );
  }
}
