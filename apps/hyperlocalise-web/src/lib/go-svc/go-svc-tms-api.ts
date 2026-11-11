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
import type { GoSvcRequestOptions } from "./go-svc-client.types";
import { orgPath, type GoSvcRequest } from "./go-svc-request";

export type GoSvcTmsJobsQuery = {
  mine?: boolean;
  recent?: boolean;
};

export type GoSvcTmsCreateJobsBody = {
  title: string;
  targetLocales: string[];
  fileIds: string[];
  assigneeExternalUserIds?: string[];
  kind?: "translation" | "proofread" | "review";
  description?: string;
};

export type GoSvcTmsUpdateJobBody = {
  title?: string;
  description?: string | null;
  assigneeExternalUserIds?: string[];
};

export class GoSvcTmsApi {
  constructor(private readonly request: GoSvcRequest) {}

  listJobs<T>(
    organizationSlug: string,
    query: GoSvcTmsJobsQuery = {},
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<{ jobs: T[] }>(orgPath(organizationSlug, "tms", "jobs"), {
      query: tmsBoolQuery(query),
      ...options,
    });
  }

  listProjectJobs<T>(
    organizationSlug: string,
    projectId: string,
    query: GoSvcTmsJobsQuery = {},
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<{ jobs: T[] }>(
      orgPath(organizationSlug, "projects", projectId, "jobs"),
      { query: tmsBoolQuery(query), ...options },
    );
  }

  createProjectJobs<T>(
    organizationSlug: string,
    projectId: string,
    body: GoSvcTmsCreateJobsBody,
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<{ jobs: T[] }>(
      orgPath(organizationSlug, "projects", projectId, "jobs"),
      { method: "POST", body, ...options },
    );
  }

  getJob<T>(organizationSlug: string, jobId: string, options: GoSvcRequestOptions = {}) {
    return this.request.json<{ job: T }>(orgPath(organizationSlug, "jobs", jobId), options);
  }

  updateJob<T>(
    organizationSlug: string,
    jobId: string,
    body: GoSvcTmsUpdateJobBody,
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<{ job: T }>(orgPath(organizationSlug, "jobs", jobId), {
      method: "PATCH",
      body,
      ...options,
    });
  }

  updateJobDescription<T>(
    organizationSlug: string,
    jobId: string,
    description: string,
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<{ job: T }>(orgPath(organizationSlug, "jobs", jobId, "description"), {
      method: "PATCH",
      body: { description },
      ...options,
    });
  }

  deleteJob(organizationSlug: string, jobId: string, options: GoSvcRequestOptions = {}) {
    return this.request.empty(orgPath(organizationSlug, "jobs", jobId), {
      method: "DELETE",
      ...options,
    });
  }

  listJobFiles<T>(organizationSlug: string, jobId: string, options: GoSvcRequestOptions = {}) {
    return this.request.json<{ files: T[] }>(
      orgPath(organizationSlug, "jobs", jobId, "files"),
      options,
    );
  }

  listJobComments<T>(organizationSlug: string, jobId: string, options: GoSvcRequestOptions = {}) {
    return this.request.json<{ comments: T[] }>(
      orgPath(organizationSlug, "jobs", jobId, "comments"),
      options,
    );
  }

  listProjectMembers<T>(
    organizationSlug: string,
    projectId: string,
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<{ members: T[] }>(
      orgPath(organizationSlug, "projects", projectId, "members"),
      options,
    );
  }
}

function tmsBoolQuery(query: GoSvcTmsJobsQuery) {
  return {
    ...(query.mine !== undefined ? { mine: query.mine ? "true" : "false" } : {}),
    ...(query.recent !== undefined ? { recent: query.recent ? "true" : "false" } : {}),
  };
}
