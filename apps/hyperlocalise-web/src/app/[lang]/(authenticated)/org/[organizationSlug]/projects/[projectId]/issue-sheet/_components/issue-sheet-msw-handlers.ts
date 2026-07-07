import { delay, http, HttpResponse } from "msw";

import {
  issueSheetIssuesFixture,
  issueSheetProjectFixture,
  issueSheetResponseFixture,
} from "./issue-sheet.fixture";

function issueSheetPath(organizationSlug: string, projectId: string, suffix = "") {
  return `/api/orgs/${encodeURIComponent(organizationSlug)}/projects/${encodeURIComponent(projectId)}/issue-sheet${suffix}`;
}

export const issueSheetMswHandlers = [
  http.get("/api/orgs/:organizationSlug/projects/:projectId", () =>
    HttpResponse.json({ project: issueSheetProjectFixture }),
  ),
  http.get(issueSheetPath(":organizationSlug", ":projectId"), () =>
    HttpResponse.json(issueSheetResponseFixture),
  ),
  http.patch(
    issueSheetPath(":organizationSlug", ":projectId", "/:issueId"),
    async ({ params, request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      const issue = issueSheetIssuesFixture.find((row) => row.id === params.issueId);
      if (!issue) {
        return HttpResponse.json({ error: "issue_not_found" }, { status: 404 });
      }
      return HttpResponse.json({
        issue: {
          ...issue,
          ...body,
          updatedAt: new Date().toISOString(),
        },
      });
    },
  ),
  http.patch(
    issueSheetPath(":organizationSlug", ":projectId", "/:issueId/values"),
    async ({ params, request }) => {
      const body = (await request.json()) as { columnKey: string; value: unknown };
      const issue = issueSheetIssuesFixture.find((row) => row.id === params.issueId);
      if (!issue) {
        return HttpResponse.json({ error: "issue_not_found" }, { status: 404 });
      }
      return HttpResponse.json({
        value: body.value,
      });
    },
  ),
  http.post(issueSheetPath(":organizationSlug", ":projectId"), async ({ request }) => {
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
  http.post(issueSheetPath(":organizationSlug", ":projectId", "/columns"), async ({ request }) => {
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
];

export const issueSheetEmptyMswHandlers = [
  http.get("/api/orgs/:organizationSlug/projects/:projectId", () =>
    HttpResponse.json({ project: issueSheetProjectFixture }),
  ),
  http.get(issueSheetPath(":organizationSlug", ":projectId"), () =>
    HttpResponse.json({
      issues: [],
      columns: issueSheetResponseFixture.columns,
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
  http.get(issueSheetPath(":organizationSlug", ":projectId"), async () => {
    await delay("infinite");
    return HttpResponse.json(issueSheetResponseFixture);
  }),
];

export const issueSheetErrorMswHandlers = [
  http.get("/api/orgs/:organizationSlug/projects/:projectId", () =>
    HttpResponse.json({ project: issueSheetProjectFixture }),
  ),
  http.get(issueSheetPath(":organizationSlug", ":projectId"), () =>
    HttpResponse.json({ error: "issue_sheet_load_failed" }, { status: 500 }),
  ),
];
