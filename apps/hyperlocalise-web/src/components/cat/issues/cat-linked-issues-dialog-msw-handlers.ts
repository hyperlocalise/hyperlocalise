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
  catLinkableIssuesFixture,
  catLinkedIssuesAssignableMembersFixture,
  catLinkedIssuesListFixture,
  catLinkedIssuesTranslationKeyId,
  type CatLinkedIssueListItemFixture,
} from "./cat-linked-issues-dialog.fixture";

const issueSheetBasePath = "/api/orgs/:organizationSlug/projects/:projectId/issue-sheet";

// The nested create-issue dialog (opened via the "Create issue" button) always fetches this when
// open — without a handler the request goes unhandled and the project-default-template
// resolution it backs silently never runs in any of these stories.
const emptyTemplateConfigHandler = http.get(`${issueSheetBasePath}/template-config`, () =>
  HttpResponse.json({ templateConfig: { defaultTemplateKey: null, assigneeByTemplate: [] } }),
);

function listResponse(issues: CatLinkedIssueListItemFixture[]) {
  return HttpResponse.json({
    issues,
    columns: [],
    total: issues.length,
    summary: {
      total: issues.length,
      open: issues.filter((issue) => issue.status === "open").length,
      inProgress: issues.filter((issue) => issue.status === "in_progress").length,
      resolved: issues.filter((issue) => issue.status === "resolved").length,
      wontFix: 0,
    },
  });
}

function linkedIssuesForRequest(request: Request) {
  const url = new URL(request.url);
  const translationKeyId = url.searchParams.get("translationKeyId");
  const search = url.searchParams.get("search")?.trim().toLowerCase() ?? "";

  if (translationKeyId) {
    return catLinkedIssuesListFixture.filter(
      (issue) => issue.translationKeyId === translationKeyId,
    );
  }

  const issues = catLinkableIssuesFixture.filter((issue) => {
    if (!search) {
      return true;
    }
    return issue.title.toLowerCase().includes(search);
  });
  return issues;
}

export const catLinkedIssuesMswHandlers = [
  http.get(`${issueSheetBasePath}/assignable-members`, () =>
    HttpResponse.json(catLinkedIssuesAssignableMembersFixture),
  ),
  http.get(issueSheetBasePath, ({ request }) => listResponse(linkedIssuesForRequest(request))),
  http.patch(`${issueSheetBasePath}/:issueId`, async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    const existing =
      catLinkableIssuesFixture.find((issue) => issue.id === params.issueId) ??
      catLinkedIssuesListFixture[0];
    return HttpResponse.json({
      issue: {
        ...existing,
        id: params.issueId,
        translationKeyId:
          body.translationKeyId === null
            ? null
            : typeof body.translationKeyId === "string"
              ? body.translationKeyId
              : (existing?.translationKeyId ?? catLinkedIssuesTranslationKeyId),
        title: existing?.title ?? "Linked issue",
        status: existing?.status ?? "open",
      },
    });
  }),
  http.post(issueSheetBasePath, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json(
      {
        issue: {
          id: "issue_created_from_string",
          title: typeof body.title === "string" ? body.title : "New linked issue",
          status: "open",
          translationKeyId:
            typeof body.translationKeyId === "string"
              ? body.translationKeyId
              : catLinkedIssuesTranslationKeyId,
        },
      },
      { status: 201 },
    );
  }),
  emptyTemplateConfigHandler,
];

export const catLinkedIssuesEmptyMswHandlers = [
  http.get(`${issueSheetBasePath}/assignable-members`, () =>
    HttpResponse.json(catLinkedIssuesAssignableMembersFixture),
  ),
  http.get(issueSheetBasePath, ({ request }) => {
    const url = new URL(request.url);
    if (url.searchParams.get("translationKeyId")) {
      return listResponse([]);
    }
    return listResponse(catLinkableIssuesFixture.filter((issue) => issue.translationKeyId == null));
  }),
  http.patch(`${issueSheetBasePath}/:issueId`, async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({
      issue: {
        id: params.issueId,
        title: "Checkout pay button too long",
        status: "open",
        translationKeyId: typeof body.translationKeyId === "string" ? body.translationKeyId : null,
      },
    });
  }),
  http.post(issueSheetBasePath, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json(
      {
        issue: {
          id: "issue_created_empty",
          title: typeof body.title === "string" ? body.title : "New issue",
          status: "open",
          translationKeyId:
            typeof body.translationKeyId === "string" ? body.translationKeyId : null,
        },
      },
      { status: 201 },
    );
  }),
  emptyTemplateConfigHandler,
];

export const catLinkedIssuesLoadingMswHandlers = [
  http.get(`${issueSheetBasePath}/assignable-members`, async () => {
    await delay("infinite");
    return HttpResponse.json(catLinkedIssuesAssignableMembersFixture);
  }),
  http.get(issueSheetBasePath, async () => {
    await delay("infinite");
    return listResponse([]);
  }),
  emptyTemplateConfigHandler,
];

export const catLinkedIssuesErrorMswHandlers = [
  http.get(`${issueSheetBasePath}/assignable-members`, () =>
    HttpResponse.json(catLinkedIssuesAssignableMembersFixture),
  ),
  http.get(issueSheetBasePath, () =>
    HttpResponse.json({ error: "issue_sheet_unavailable" }, { status: 500 }),
  ),
  emptyTemplateConfigHandler,
];
