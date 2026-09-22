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
import type { GoSvcRecord, GoSvcRequestOptions, IssueSheetListQuery } from "./go-svc-client.types";
import { issueSheetPath, type GoSvcRequest } from "./go-svc-request";

export class GoSvcIssueSheetApi {
  readonly columns: GoSvcIssueSheetColumnsApi;
  readonly templateConfig: GoSvcIssueSheetTemplateConfigApi;
  readonly comments: GoSvcIssueSheetCommentsApi;
  readonly relationships: GoSvcIssueSheetRelationshipsApi;

  constructor(private readonly request: GoSvcRequest) {
    this.columns = new GoSvcIssueSheetColumnsApi(request);
    this.templateConfig = new GoSvcIssueSheetTemplateConfigApi(request);
    this.comments = new GoSvcIssueSheetCommentsApi(request);
    this.relationships = new GoSvcIssueSheetRelationshipsApi(request);
  }

  list(
    organizationSlug: string,
    projectId: string,
    query: IssueSheetListQuery = {},
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<{
      issues: GoSvcRecord[];
      columns: GoSvcRecord[];
      total: number;
      summary: Record<string, number>;
    }>(issueSheetPath(organizationSlug, projectId), { query, ...options });
  }

  create(
    organizationSlug: string,
    projectId: string,
    body: GoSvcRecord & { title: string },
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<{ issue: GoSvcRecord }>(issueSheetPath(organizationSlug, projectId), {
      method: "POST",
      body,
      ...options,
    });
  }

  get(
    organizationSlug: string,
    projectId: string,
    issueId: string,
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<{ issue: GoSvcRecord }>(
      issueSheetPath(organizationSlug, projectId, issueId),
      options,
    );
  }

  update(
    organizationSlug: string,
    projectId: string,
    issueId: string,
    body: GoSvcRecord,
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<{ issue: GoSvcRecord }>(
      issueSheetPath(organizationSlug, projectId, issueId),
      { method: "PATCH", body, ...options },
    );
  }

  setValue(
    organizationSlug: string,
    projectId: string,
    issueId: string,
    body: { columnKey: string; value: unknown },
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<{ value: { columnKey: string; value: unknown } }>(
      issueSheetPath(organizationSlug, projectId, issueId, "values"),
      { method: "PATCH", body, ...options },
    );
  }

  assignableMembers(
    organizationSlug: string,
    projectId: string,
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<{ members: GoSvcRecord[] }>(
      issueSheetPath(organizationSlug, projectId, "assignable-members"),
      options,
    );
  }

  feed(
    organizationSlug: string,
    projectId: string,
    issueId: string,
    query: { limit?: number; cursor?: string; mode?: "comments" } = {},
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<GoSvcRecord>(
      issueSheetPath(organizationSlug, projectId, issueId, "feed"),
      { query, ...options },
    );
  }

  subscriptions(
    organizationSlug: string,
    projectId: string,
    issueId: string,
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<GoSvcRecord>(
      issueSheetPath(organizationSlug, projectId, issueId, "subscriptions"),
      options,
    );
  }

  watch(
    organizationSlug: string,
    projectId: string,
    issueId: string,
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<GoSvcRecord>(
      issueSheetPath(organizationSlug, projectId, issueId, "subscription"),
      { method: "POST", ...options },
    );
  }

  unwatch(
    organizationSlug: string,
    projectId: string,
    issueId: string,
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.empty(
      issueSheetPath(organizationSlug, projectId, issueId, "subscription"),
      {
        method: "DELETE",
        ...options,
      },
    );
  }
}

export class GoSvcIssueSheetColumnsApi {
  constructor(private readonly request: GoSvcRequest) {}

  list(organizationSlug: string, projectId: string, options: GoSvcRequestOptions = {}) {
    return this.request.json<{ columns: GoSvcRecord[] }>(
      issueSheetPath(organizationSlug, projectId, "columns"),
      options,
    );
  }

  create(
    organizationSlug: string,
    projectId: string,
    body: GoSvcRecord & { key: string; label: string; type: string },
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<{ column: GoSvcRecord }>(
      issueSheetPath(organizationSlug, projectId, "columns"),
      { method: "POST", body, ...options },
    );
  }

  update(
    organizationSlug: string,
    projectId: string,
    columnId: string,
    body: GoSvcRecord,
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<{ column: GoSvcRecord }>(
      issueSheetPath(organizationSlug, projectId, "columns", columnId),
      { method: "PATCH", body, ...options },
    );
  }

  reorder(
    organizationSlug: string,
    projectId: string,
    columnIds: string[],
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<{ columns: GoSvcRecord[] }>(
      issueSheetPath(organizationSlug, projectId, "columns", "order"),
      { method: "PUT", body: { columnIds }, ...options },
    );
  }

  delete(
    organizationSlug: string,
    projectId: string,
    columnId: string,
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.empty(issueSheetPath(organizationSlug, projectId, "columns", columnId), {
      method: "DELETE",
      ...options,
    });
  }
}

export class GoSvcIssueSheetTemplateConfigApi {
  constructor(private readonly request: GoSvcRequest) {}

  get(organizationSlug: string, projectId: string, options: GoSvcRequestOptions = {}) {
    return this.request.json<GoSvcRecord>(
      issueSheetPath(organizationSlug, projectId, "template-config"),
      options,
    );
  }

  update(
    organizationSlug: string,
    projectId: string,
    body: GoSvcRecord,
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<GoSvcRecord>(
      issueSheetPath(organizationSlug, projectId, "template-config"),
      { method: "PUT", body, ...options },
    );
  }
}

export class GoSvcIssueSheetCommentsApi {
  constructor(private readonly request: GoSvcRequest) {}

  create(
    organizationSlug: string,
    projectId: string,
    issueId: string,
    body: GoSvcRecord,
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<GoSvcRecord>(
      issueSheetPath(organizationSlug, projectId, issueId, "comments"),
      { method: "POST", body, ...options },
    );
  }

  update(
    organizationSlug: string,
    projectId: string,
    issueId: string,
    commentId: string,
    body: GoSvcRecord,
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<GoSvcRecord>(
      issueSheetPath(organizationSlug, projectId, issueId, "comments", commentId),
      { method: "PATCH", body, ...options },
    );
  }

  delete(
    organizationSlug: string,
    projectId: string,
    issueId: string,
    commentId: string,
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.empty(
      issueSheetPath(organizationSlug, projectId, issueId, "comments", commentId),
      { method: "DELETE", ...options },
    );
  }
}

export class GoSvcIssueSheetRelationshipsApi {
  constructor(private readonly request: GoSvcRequest) {}

  list(
    organizationSlug: string,
    projectId: string,
    issueId: string,
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<GoSvcRecord>(
      issueSheetPath(organizationSlug, projectId, issueId, "relationships"),
      options,
    );
  }

  create(
    organizationSlug: string,
    projectId: string,
    issueId: string,
    body: GoSvcRecord,
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<GoSvcRecord>(
      issueSheetPath(organizationSlug, projectId, issueId, "relationships"),
      { method: "POST", body, ...options },
    );
  }

  delete(
    organizationSlug: string,
    projectId: string,
    issueId: string,
    relationshipId: string,
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.empty(
      issueSheetPath(organizationSlug, projectId, issueId, "relationships", relationshipId),
      { method: "DELETE", ...options },
    );
  }
}
