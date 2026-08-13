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
  issueSheetManySubscribersFixture,
  issueSheetProjectFixture,
  issueSheetResponseFixture,
  issueSheetSubscribersFixture,
} from "./issue-sheet.fixture";

const issueSheetBasePath = "/api/orgs/:organizationSlug/projects/:projectId/issue-sheet";

const watchedIssueIds = new Set(
  issueSheetIssuesFixture.filter((issue) => issue.isWatching).map((issue) => issue.id),
);

const subscribersByIssueId = new Map<string, Set<string>>(
  issueSheetIssuesFixture
    .filter((issue) => issue.isWatching)
    .map((issue) => [
      issue.id,
      new Set(issueSheetSubscribersFixture.map((subscriber) => subscriber.userId)),
    ]),
);

function subscribersForIssue(issueId: string) {
  const userIds = subscribersByIssueId.get(issueId);
  if (!userIds || userIds.size === 0) {
    return [];
  }
  return issueSheetSubscribersFixture.filter((subscriber) => userIds.has(subscriber.userId));
}

function issueWithWatchState(issue: (typeof issueSheetIssuesFixture)[number]) {
  return {
    ...issue,
    isWatching: watchedIssueIds.has(issue.id),
  };
}

const issueSubscriptionHandlers = [
  http.get(`${issueSheetBasePath}/:issueId/subscriptions`, ({ params }) => {
    const issue = issueSheetIssuesFixture.find((row) => row.id === params.issueId);
    if (!issue) {
      return HttpResponse.json({ error: "issue_not_found" }, { status: 404 });
    }
    return HttpResponse.json({ subscribers: subscribersForIssue(String(params.issueId)) });
  }),
  http.post(`${issueSheetBasePath}/:issueId/subscription`, ({ params }) => {
    const issueId = String(params.issueId);
    watchedIssueIds.add(issueId);
    const subscribers = subscribersByIssueId.get(issueId) ?? new Set<string>();
    subscribers.add("user_storybook");
    subscribersByIssueId.set(issueId, subscribers);
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
    const issueId = String(params.issueId);
    watchedIssueIds.delete(issueId);
    const subscribers = subscribersByIssueId.get(issueId);
    subscribers?.delete("user_storybook");
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
      icon?: string | null;
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
          hidden: false,
          icon: body.icon ?? null,
        },
      },
      { status: 201 },
    );
  }),
  http.patch(`${issueSheetBasePath}/columns/:columnId`, async ({ params, request }) => {
    const column = issueSheetResponseFixture.columns.find((entry) => entry.id === params.columnId);
    if (!column) {
      return HttpResponse.json({ error: "issue_sheet_column_not_found" }, { status: 404 });
    }
    const body = (await request.json()) as {
      label?: string;
      hidden?: boolean;
      icon?: string | null;
      config?: { options?: { id: string; label: string }[] };
    };
    if (body.label !== undefined) {
      column.label = body.label;
    }
    if (body.hidden !== undefined) {
      column.hidden = body.hidden;
    }
    if (body.icon !== undefined) {
      column.icon = body.icon;
    }
    if (body.config !== undefined) {
      column.config = body.config;
    }
    return HttpResponse.json({ column });
  }),
  http.put(`${issueSheetBasePath}/columns/order`, async ({ request }) => {
    const body = (await request.json()) as { columnIds: string[] };
    const byId = new Map(issueSheetResponseFixture.columns.map((column) => [column.id, column]));
    issueSheetResponseFixture.columns = body.columnIds.flatMap((columnId, index) => {
      const column = byId.get(columnId);
      if (!column) {
        return [];
      }
      column.sortOrder = (index + 1) * 10;
      return [column];
    });
    return HttpResponse.json({ columns: issueSheetResponseFixture.columns });
  }),
  http.delete(`${issueSheetBasePath}/columns/:columnId`, ({ params }) => {
    const index = issueSheetResponseFixture.columns.findIndex(
      (entry) => entry.id === params.columnId,
    );
    if (index < 0) {
      return HttpResponse.json({ error: "issue_sheet_column_not_found" }, { status: 404 });
    }
    issueSheetResponseFixture.columns.splice(index, 1);
    return new HttpResponse(null, { status: 204 });
  }),
  ...issueSubscriptionHandlers,
];

export const issueDetailManySubscribersMswHandlers = [
  http.get(`${issueSheetBasePath}/:issueId/subscriptions`, ({ params }) => {
    const issue = issueSheetIssuesFixture.find((row) => row.id === params.issueId);
    if (!issue) {
      return HttpResponse.json({ error: "issue_not_found" }, { status: 404 });
    }
    return HttpResponse.json({ subscribers: issueSheetManySubscribersFixture });
  }),
  ...issueSheetMswHandlers,
];

export const issueDetailNotSubscribedMswHandlers = [
  http.get(`${issueSheetBasePath}/:issueId`, ({ params }) => {
    const issue = issueSheetIssuesFixture.find((row) => row.id === params.issueId);
    if (!issue) {
      return HttpResponse.json({ error: "issue_not_found" }, { status: 404 });
    }
    return HttpResponse.json({
      issue: {
        ...issue,
        isWatching: false,
      },
    });
  }),
  http.get(`${issueSheetBasePath}/:issueId/subscriptions`, () =>
    HttpResponse.json({ subscribers: issueSheetSubscribersFixture }),
  ),
  ...issueSheetMswHandlers,
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
