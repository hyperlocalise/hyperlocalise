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

export type GoSvcJobListQuery = {
  kind?: string;
  type?: string;
  status?: string;
  open?: boolean;
  triage?: boolean;
  relationship?: "assigned" | "created";
  limit?: number;
};

export class GoSvcJobApi {
  constructor(private readonly request: GoSvcRequest) {}

  list<T>(
    organizationSlug: string,
    query: GoSvcJobListQuery = {},
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<{ jobs: T[] }>(orgPath(organizationSlug, "jobs"), {
      query,
      ...options,
    });
  }

  listProject<T>(
    organizationSlug: string,
    projectId: string,
    query: GoSvcJobListQuery = {},
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<{ jobs: T[] }>(
      orgPath(organizationSlug, "projects", projectId, "jobs"),
      { query, ...options },
    );
  }

  get<T>(organizationSlug: string, jobId: string, options: GoSvcRequestOptions = {}) {
    return this.request.json<{ job: T }>(orgPath(organizationSlug, "jobs", jobId), options);
  }

  getProject<T>(
    organizationSlug: string,
    projectId: string,
    jobId: string,
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<{ job: T }>(
      orgPath(organizationSlug, "projects", projectId, "jobs", jobId),
      options,
    );
  }

  status<T>(
    organizationSlug: string,
    projectId: string,
    jobId: string,
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<{ job: T }>(
      orgPath(organizationSlug, "projects", projectId, "jobs", jobId, "status"),
      options,
    );
  }
}
