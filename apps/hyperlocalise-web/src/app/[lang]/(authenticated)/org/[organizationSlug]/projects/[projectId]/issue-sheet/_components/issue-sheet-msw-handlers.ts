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
import { delay, http, HttpResponse } from "msw";

import {
  issueSheetAssignableMembersFixture,
  issueSheetIssuesFixture,
  issueSheetProjectFixture,
  issueSheetResponseFixture,
} from "./issue-sheet.fixture";

const issueSheetBasePath = "/api/orgs/:organizationSlug/projects/:projectId/issue-sheet";

const watchedIssueIds = new Set(
  issueSheetIssuesFixture.filter((issue) => issue.isWatching).map((issue) => issue.id),
);

function issueWithWatchState(issue: (typeof issueSheetIssuesFixture)[number]) {
  return {
    ...issue,
    isWatching: watchedIssueIds.has(issue.id),
  };
}

const issueSubscriptionHandlers = [
  http.post(`${issueSheetBasePath}/:issueId/subscription`, ({ params }) => {
    watchedIssueIds.add(String(params.issueId));
    return HttpResponse.json(
      {
        subscription: {
          issueId: params.issueId,
          userId: "user_storybook",
          createdAt: new Date().toISOString(),
        },
      },
      { status: 201 },
    );
  }),
  http.delete(`${issueSheetBasePath}/:issueId/subscription`, ({ params }) => {
    watchedIssueIds.delete(String(params.issueId));
    return new HttpResponse(null, { status: 204 });
  }),
];

export const issueSheetMswHandlers = [
  http.get("/api/orgs/:organizationSlug/projects/:projectId", () =>
    HttpResponse.json({ project: issueSheetProjectFixture }),
  ),
  http.get(issueSheetBasePath, () => HttpResponse.json(issueSheetResponseFixture)),
  http.get(`${issueSheetBasePath}/columns`, () =>
    HttpResponse.json({ columns: issueSheetResponseFixture.columns }),
  ),
  http.get(`${issueSheetBasePath}/assignable-members`, () =>
    HttpResponse.json({ members: issueSheetAssignableMembersFixture }),
  ),
  http.get(`${issueSheetBasePath}/:issueId`, ({ params }) => {
    const issue = issueSheetIssuesFixture.find((row) => row.id === params.issueId);
    if (!issue) {
      return HttpResponse.json({ error: "issue_not_found" }, { status: 404 });
    }
    return HttpResponse.json({ issue: issueWithWatchState(issue) });
  }),
  http.get(`${issueSheetBasePath}/:issueId/feed`, () =>
    HttpResponse.json({
      items: [],
      total: 0,
      nextCursor: null,
    }),
  ),
  http.patch(`${issueSheetBasePath}/:issueId`, async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    const issue = issueSheetIssuesFixture.find((row) => row.id === params.issueId);
    if (!issue) {
      return HttpResponse.json({ error: "issue_not_found" }, { status: 404 });
    }
    return HttpResponse.json({
      issue: {
        ...issueWithWatchState(issue),
        ...body,
        updatedAt: new Date().toISOString(),
      },
    });
  }),
  http.patch(`${issueSheetBasePath}/:issueId/values`, async ({ params, request }) => {
    const body = (await request.json()) as { columnKey: string; value: unknown };
    const issue = issueSheetIssuesFixture.find((row) => row.id === params.issueId);
    if (!issue) {
      return HttpResponse.json({ error: "issue_not_found" }, { status: 404 });
    }
    return HttpResponse.json({
      value: body.value,
    });
  }),
  http.post(issueSheetBasePath, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    const issue = issueSheetIssuesFixture[0];
    return HttpResponse.json(
      {
        issue: {
          ...issue,
          id: "issue_new",
          title: typeof body.title === "string" ? body.title : issue.title,
          description: typeof body.description === "string" ? body.description : issue.description,
        },
      },
      { status: 201 },
    );
  }),
  http.post(`${issueSheetBasePath}/columns`, async ({ request }) => {
    const body = (await request.json()) as {
      key: string;
      label: string;
      type: string;
      config?: { options?: { id: string; label: string }[] };
    };
    return HttpResponse.json(
      {
        column: {
          id: `col_${body.key}`,
          key: body.key,
          label: body.label,
          layer: "custom",
          type: body.type,
          config: body.config ?? {},
          sortOrder: issueSheetResponseFixture.columns.length,
        },
      },
      { status: 201 },
    );
  }),
  ...issueSubscriptionHandlers,
];

export const issueSheetEmptyMswHandlers = [
  http.get("/api/orgs/:organizationSlug/projects/:projectId", () =>
    HttpResponse.json({ project: issueSheetProjectFixture }),
  ),
  http.get(issueSheetBasePath, () =>
    HttpResponse.json({
      issues: [],
      columns: issueSheetResponseFixture.columns,
      total: 0,
      summary: {
        total: 0,
        open: 0,
        inProgress: 0,
        resolved: 0,
        wontFix: 0,
      },
    }),
  ),
];

export const issueSheetLoadingMswHandlers = [
  http.get("/api/orgs/:organizationSlug/projects/:projectId", async () => {
    await delay("infinite");
    return HttpResponse.json({ project: issueSheetProjectFixture });
  }),
  http.get(issueSheetBasePath, async () => {
    await delay("infinite");
    return HttpResponse.json(issueSheetResponseFixture);
  }),
];

export const issueSheetErrorMswHandlers = [
  http.get("/api/orgs/:organizationSlug/projects/:projectId", () =>
    HttpResponse.json({ project: issueSheetProjectFixture }),
  ),
  http.get(issueSheetBasePath, () =>
    HttpResponse.json({ error: "issue_sheet_load_failed" }, { status: 500 }),
  ),
];

export const issueDetailColumnsErrorMswHandlers = [
  http.get("/api/orgs/:organizationSlug/projects/:projectId", () =>
    HttpResponse.json({ project: issueSheetProjectFixture }),
  ),
  http.get(`${issueSheetBasePath}/columns`, () =>
    HttpResponse.json({ error: "issue_sheet_columns_load_failed" }, { status: 500 }),
  ),
  http.get(`${issueSheetBasePath}/assignable-members`, () =>
    HttpResponse.json({ members: issueSheetAssignableMembersFixture }),
  ),
  http.get(`${issueSheetBasePath}/:issueId/feed`, () =>
    HttpResponse.json({ items: [], total: 0, nextCursor: null }),
  ),
  http.get(`${issueSheetBasePath}/:issueId`, ({ params }) => {
    const issue = issueSheetIssuesFixture.find((row) => row.id === params.issueId);
    if (!issue) {
      return HttpResponse.json({ error: "issue_not_found" }, { status: 404 });
    }
    return HttpResponse.json({ issue: issueWithWatchState(issue) });
  }),
  ...issueSubscriptionHandlers,
];

export const issueDetailLoadingMswHandlers = [
  http.get("/api/orgs/:organizationSlug/projects/:projectId", async () => {
    await delay("infinite");
    return HttpResponse.json({ project: issueSheetProjectFixture });
  }),
  http.get(`${issueSheetBasePath}/columns`, async () => {
    await delay("infinite");
    return HttpResponse.json({ columns: issueSheetResponseFixture.columns });
  }),
  http.get(`${issueSheetBasePath}/:issueId`, async () => {
    await delay("infinite");
    return HttpResponse.json({ issue: issueSheetIssuesFixture[0] });
  }),
  http.get(`${issueSheetBasePath}/assignable-members`, async () => {
    await delay("infinite");
    return HttpResponse.json({ members: issueSheetAssignableMembersFixture });
  }),
  http.get(`${issueSheetBasePath}/:issueId/feed`, async () => {
    await delay("infinite");
    return HttpResponse.json({ items: [], total: 0, nextCursor: null });
  }),
];

export const issueDetailNotFoundMswHandlers = [
  http.get("/api/orgs/:organizationSlug/projects/:projectId", () =>
    HttpResponse.json({ project: issueSheetProjectFixture }),
  ),
  http.get(`${issueSheetBasePath}/columns`, () =>
    HttpResponse.json({ columns: issueSheetResponseFixture.columns }),
  ),
  http.get(`${issueSheetBasePath}/assignable-members`, () =>
    HttpResponse.json({ members: issueSheetAssignableMembersFixture }),
  ),
  http.get(`${issueSheetBasePath}/:issueId`, () =>
    HttpResponse.json({ error: "issue_not_found" }, { status: 404 }),
  ),
];

export const issueDetailUnavailableMswHandlers = [
  http.get(`${issueSheetBasePath}/:issueId`, () =>
    HttpResponse.json({ error: "issue_not_found" }, { status: 404 }),
  ),
];
