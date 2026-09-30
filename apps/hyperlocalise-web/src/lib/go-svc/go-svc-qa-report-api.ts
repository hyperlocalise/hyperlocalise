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
import type { GoSvcQuery, GoSvcRecord, GoSvcRequestOptions } from "./go-svc-client.types";
import { orgPath, type GoSvcRequest } from "./go-svc-request";

export class GoSvcQaReportApi {
  readonly findings: GoSvcQaReportFindingsApi;
  readonly project: GoSvcProjectQaReportApi;

  constructor(private readonly request: GoSvcRequest) {
    this.findings = new GoSvcQaReportFindingsApi(request);
    this.project = new GoSvcProjectQaReportApi(request);
  }

  list(organizationSlug: string, options: GoSvcRequestOptions = {}) {
    return this.request.json<GoSvcRecord>(orgPath(organizationSlug, "qa-reports"), options);
  }
}

export class GoSvcQaReportFindingsApi {
  constructor(private readonly request: GoSvcRequest) {}

  list(organizationSlug: string, query: GoSvcQuery = {}, options: GoSvcRequestOptions = {}) {
    return this.request.json<GoSvcRecord>(orgPath(organizationSlug, "qa-reports", "findings"), {
      query,
      ...options,
    });
  }

  promote(organizationSlug: string, body: GoSvcRecord, options: GoSvcRequestOptions = {}) {
    return this.request.json<GoSvcRecord>(
      orgPath(organizationSlug, "qa-reports", "findings", "promote"),
      { method: "POST", body, ...options },
    );
  }
}

export class GoSvcProjectQaReportApi {
  constructor(private readonly request: GoSvcRequest) {}

  list(organizationSlug: string, projectId: string, options: GoSvcRequestOptions = {}) {
    return this.request.json<GoSvcRecord>(
      orgPath(organizationSlug, "projects", projectId, "qa-reports"),
      options,
    );
  }

  get(
    organizationSlug: string,
    projectId: string,
    runId: string,
    query: GoSvcQuery = {},
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<GoSvcRecord>(
      orgPath(organizationSlug, "projects", projectId, "qa-reports", runId),
      { query, ...options },
    );
  }

  updateSettings(
    organizationSlug: string,
    projectId: string,
    body: GoSvcRecord,
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<GoSvcRecord>(
      orgPath(organizationSlug, "projects", projectId, "qa-reports", "settings"),
      { method: "PATCH", body, ...options },
    );
  }

  latestFindings(
    organizationSlug: string,
    projectId: string,
    query: GoSvcQuery = {},
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<GoSvcRecord>(
      orgPath(organizationSlug, "projects", projectId, "qa-reports", "latest-findings"),
      { query, ...options },
    );
  }

  promoteFindings(
    organizationSlug: string,
    projectId: string,
    body: GoSvcRecord,
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<GoSvcRecord>(
      orgPath(organizationSlug, "projects", projectId, "qa-reports", "findings", "promote"),
      { method: "POST", body, ...options },
    );
  }
}
