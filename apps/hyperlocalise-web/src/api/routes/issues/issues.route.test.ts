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
import "dotenv/config";

import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { app } from "@/api/app";
import { db } from "@/lib/database";

import { createProjectTestFixture } from "../project/project.fixture";

const { resolveApiAuthContextFromSessionMock } = vi.hoisted(() => ({
  resolveApiAuthContextFromSessionMock: vi.fn(
    (options) =>
      globalThis.__resolveTestApiAuthContextFromSession?.(options) ??
      globalThis.__testApiAuthContext ??
      null,
  ),
}));

vi.mock("@/api/auth/workos-session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/auth/workos-session")>();
  return {
    ...actual,
    resolveApiAuthContextFromSession: resolveApiAuthContextFromSessionMock,
  };
});

const projectFixture = createProjectTestFixture();

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  vi.clearAllMocks();
  await projectFixture.cleanup();
});

function organizationIssuesUrl(organizationSlug: string) {
  return `/api/orgs/${encodeURIComponent(organizationSlug)}/issues`;
}

function issueSheetUrl(organizationSlug: string, projectId: string) {
  return `/api/orgs/${encodeURIComponent(organizationSlug)}/projects/${encodeURIComponent(projectId)}/issue-sheet`;
}

async function requestJson(
  url: string,
  input: {
    method?: string;
    headers: HeadersInit;
    body?: unknown;
    query?: Record<string, string>;
  },
) {
  const query = input.query ? `?${new URLSearchParams(input.query).toString()}` : "";
  return app.request(`${url}${query}`, {
    method: input.method ?? "GET",
    headers: {
      ...(input.body ? { "Content-Type": "application/json" } : {}),
      ...Object.fromEntries(new Headers(input.headers).entries()),
    },
    body: input.body ? JSON.stringify(input.body) : undefined,
  });
}

type ListBody = {
  issues: Array<{
    id: string;
    title: string;
    issueType: string;
    status: string;
    projectId?: string;
    targetLocale?: string | null;
    assigneeUserId?: string | null;
    values?: Record<string, unknown>;
  }>;
  total: number;
};

describe("Organization issues routes", () => {
  it("lists issues across accessible projects", async () => {
    const { identity, project } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const createResponse = await requestJson(issueSheetUrl(organizationSlug, project.id), {
      method: "POST",
      headers,
      body: {
        title: "Workspace-wide issue",
        issueType: "general_question",
      },
    });
    expect(createResponse.status).toBe(201);

    const listResponse = await requestJson(organizationIssuesUrl(organizationSlug), {
      headers,
      query: { view: "all_open" },
    });

    expect(listResponse.status).toBe(200);
    const listBody = (await listResponse.json()) as ListBody & {
      summary: { open: number };
    };
    expect(listBody.total).toBe(1);
    expect(listBody.summary.open).toBe(1);
    expect(listBody.issues[0]).toMatchObject({
      title: "Workspace-wide issue",
      projectId: project.id,
    });
  });

  it("supports built-in views, filters, project scoping, and stable sort pagination", async () => {
    const { identity, project, user } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";
    const actorUserId = user.id;

    const payloads = [
      {
        title: "QA unassigned open",
        issueType: "qa_failure",
        status: "open",
        targetLocale: "de-DE",
        priority: "P0",
      },
      {
        title: "My assigned open",
        issueType: "translation_mistake",
        status: "open",
        assigneeUserId: actorUserId,
        targetLocale: "fr-FR",
        priority: "P2",
      },
      {
        title: "Source context open",
        issueType: "context_request",
        status: "in_progress",
        targetLocale: "de-DE",
        priority: "P1",
      },
      {
        title: "Resolved QA",
        issueType: "qa_failure",
        status: "resolved",
        targetLocale: "es-ES",
        priority: "P1",
      },
    ] as const;

    for (const payload of payloads) {
      const response = await requestJson(issueSheetUrl(organizationSlug, project.id), {
        method: "POST",
        headers,
        body: payload,
      });
      expect(response.status).toBe(201);
    }

    const qaTriage = await requestJson(organizationIssuesUrl(organizationSlug), {
      headers,
      query: { view: "qa_triage" },
    });
    expect(qaTriage.status).toBe(200);
    const qaTriageBody = (await qaTriage.json()) as ListBody;
    expect(qaTriageBody.issues.map((issue) => issue.title)).toEqual(["QA unassigned open"]);

    const myWork = await requestJson(organizationIssuesUrl(organizationSlug), {
      headers,
      query: { view: "my_work" },
    });
    const myWorkBody = (await myWork.json()) as ListBody;
    expect(myWorkBody.issues.map((issue) => issue.title)).toEqual(["My assigned open"]);

    const sourceContext = await requestJson(organizationIssuesUrl(organizationSlug), {
      headers,
      query: { view: "source_context" },
    });
    const sourceContextBody = (await sourceContext.json()) as ListBody;
    expect(sourceContextBody.issues.map((issue) => issue.title).sort()).toEqual([
      "Source context open",
    ]);

    const filtered = await requestJson(organizationIssuesUrl(organizationSlug), {
      headers,
      query: {
        view: "all_open",
        locale: "de-DE",
        priority: "P0",
        assignee: "unassigned",
        projectId: project.id,
        sort: "priority",
        sortDir: "asc",
      },
    });
    expect(filtered.status).toBe(200);
    const filteredBody = (await filtered.json()) as ListBody;
    expect(filteredBody.total).toBe(1);
    expect(filteredBody.issues[0]?.title).toBe("QA unassigned open");

    const sorted = await requestJson(organizationIssuesUrl(organizationSlug), {
      headers,
      query: {
        view: "all_open",
        sort: "priority",
        limit: "2",
        offset: "0",
      },
    });
    const sortedBody = (await sorted.json()) as ListBody;
    // Status stays primary for grouped list pagination; priority sorts within status.
    expect(sortedBody.issues.map((issue) => issue.title)).toEqual([
      "QA unassigned open",
      "My assigned open",
    ]);

    const pageTwo = await requestJson(organizationIssuesUrl(organizationSlug), {
      headers,
      query: {
        view: "all_open",
        sort: "priority",
        limit: "2",
        offset: "2",
      },
    });
    const pageTwoBody = (await pageTwo.json()) as ListBody;
    expect(pageTwoBody.issues.map((issue) => issue.title)).toEqual(["Source context open"]);
    expect(
      new Set([...sortedBody.issues, ...pageTwoBody.issues].map((issue) => issue.id)).size,
    ).toBe(3);

    const statusSorted = await requestJson(organizationIssuesUrl(organizationSlug), {
      headers,
      query: {
        view: "all_open",
        sort: "status",
      },
    });
    const statusSortedBody = (await statusSorted.json()) as ListBody;
    expect(statusSortedBody.issues.map((issue) => issue.status)).toEqual([
      "open",
      "open",
      "in_progress",
    ]);
  });
});

function organizationIssuesBulkUrl(organizationSlug: string) {
  return `${organizationIssuesUrl(organizationSlug)}/bulk-actions`;
}

describe("Organization issues bulk actions", () => {
  it("bulk sets status with partial success semantics and activity", async () => {
    const { identity, project } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const createOpen = await requestJson(issueSheetUrl(organizationSlug, project.id), {
      method: "POST",
      headers,
      body: { title: "Bulk open", issueType: "general_question", status: "open" },
    });
    expect(createOpen.status).toBe(201);
    const openIssue = (await createOpen.json()) as { issue: { id: string } };

    const createResolved = await requestJson(issueSheetUrl(organizationSlug, project.id), {
      method: "POST",
      headers,
      body: { title: "Bulk resolved", issueType: "general_question", status: "resolved" },
    });
    expect(createResolved.status).toBe(201);
    const resolvedIssue = (await createResolved.json()) as { issue: { id: string } };

    const bulkResponse = await requestJson(organizationIssuesBulkUrl(organizationSlug), {
      method: "POST",
      headers,
      body: {
        action: "set_status",
        status: "in_progress",
        issues: [
          { projectId: project.id, issueId: openIssue.issue.id },
          { projectId: project.id, issueId: resolvedIssue.issue.id },
        ],
      },
    });
    expect(bulkResponse.status).toBe(200);
    const bulkBody = (await bulkResponse.json()) as {
      bulkAction: {
        succeeded: number;
        unchanged: number;
        failed: number;
        results: Array<{ issueId: string; outcome: string }>;
      };
    };
    expect(bulkBody.bulkAction.succeeded).toBe(2);
    expect(bulkBody.bulkAction.failed).toBe(0);
    expect(bulkBody.bulkAction.results).toHaveLength(2);

    const unchangedResponse = await requestJson(organizationIssuesBulkUrl(organizationSlug), {
      method: "POST",
      headers,
      body: {
        action: "set_status",
        status: "in_progress",
        issues: [{ projectId: project.id, issueId: openIssue.issue.id }],
      },
    });
    expect(unchangedResponse.status).toBe(200);
    const unchangedBody = (await unchangedResponse.json()) as {
      bulkAction: { unchanged: number; succeeded: number };
    };
    expect(unchangedBody.bulkAction.unchanged).toBe(1);
    expect(unchangedBody.bulkAction.succeeded).toBe(0);
  });

  it("returns issue_not_found for inaccessible issues without leaking existence", async () => {
    const owner = await projectFixture.createStoredProjectFixture();
    const outsider = await projectFixture.createStoredProjectFixture();
    const ownerHeaders = await projectFixture.authHeadersFor(owner.identity);
    const outsiderHeaders = await projectFixture.authHeadersFor(outsider.identity);
    const ownerSlug = owner.identity.organization.slug ?? "missing-slug";

    const createResponse = await requestJson(issueSheetUrl(ownerSlug, owner.project.id), {
      method: "POST",
      headers: ownerHeaders,
      body: { title: "Private issue", issueType: "general_question" },
    });
    expect(createResponse.status).toBe(201);
    const created = (await createResponse.json()) as { issue: { id: string } };

    const bulkResponse = await requestJson(organizationIssuesBulkUrl(ownerSlug), {
      method: "POST",
      headers: outsiderHeaders,
      body: {
        action: "unassign",
        issues: [{ projectId: owner.project.id, issueId: created.issue.id }],
      },
    });
    expect(bulkResponse.status).toBe(200);
    const bulkBody = (await bulkResponse.json()) as {
      bulkAction: {
        failed: number;
        results: Array<{ outcome: string; error?: { code: string } }>;
      };
    };
    expect(bulkBody.bulkAction.failed).toBe(1);
    expect(bulkBody.bulkAction.results[0]).toMatchObject({
      outcome: "failed",
      error: { code: "issue_not_found" },
    });
  });

  it("rejects bulk payloads over the item limit", async () => {
    const { identity, project } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const issues = Array.from({ length: 101 }, (_, index) => ({
      projectId: project.id,
      issueId: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    }));

    const bulkResponse = await requestJson(organizationIssuesBulkUrl(organizationSlug), {
      method: "POST",
      headers,
      body: {
        action: "unassign",
        issues,
      },
    });
    expect(bulkResponse.status).toBe(400);
    await expect(bulkResponse.json()).resolves.toMatchObject({
      error: "invalid_issue_bulk_action",
    });
  });

  it("dedupes duplicate bulk targets and covers assign, priority, and issue type", async () => {
    const { identity, project, user } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const createResponse = await requestJson(issueSheetUrl(organizationSlug, project.id), {
      method: "POST",
      headers,
      body: {
        title: "Bulk multi-field",
        issueType: "general_question",
        status: "open",
        priority: "P2",
      },
    });
    expect(createResponse.status).toBe(201);
    const created = (await createResponse.json()) as {
      issue: { id: string; values?: { priority?: string } };
    };
    expect(created.issue.values?.priority).toBe("P2");

    const target = { projectId: project.id, issueId: created.issue.id };

    const assignResponse = await requestJson(organizationIssuesBulkUrl(organizationSlug), {
      method: "POST",
      headers,
      body: {
        action: "assign",
        assigneeUserId: user.id,
        issues: [target, target],
      },
    });
    expect(assignResponse.status).toBe(200);
    const assignBody = (await assignResponse.json()) as {
      bulkAction: {
        requested: number;
        succeeded: number;
        results: Array<{ outcome: string; issue?: { assigneeUserId: string | null } }>;
      };
    };
    expect(assignBody.bulkAction.requested).toBe(1);
    expect(assignBody.bulkAction.succeeded).toBe(1);
    expect(assignBody.bulkAction.results).toHaveLength(1);
    expect(assignBody.bulkAction.results[0]?.issue?.assigneeUserId).toBe(user.id);

    const priorityResponse = await requestJson(organizationIssuesBulkUrl(organizationSlug), {
      method: "POST",
      headers,
      body: {
        action: "set_priority",
        priority: "P0",
        issues: [target],
      },
    });
    expect(priorityResponse.status).toBe(200);
    const priorityBody = (await priorityResponse.json()) as {
      bulkAction: {
        succeeded: number;
        unchanged: number;
        results: Array<{ outcome: string; issue?: { values?: { priority?: string } } }>;
      };
    };
    expect(priorityBody.bulkAction.succeeded).toBe(1);
    expect(priorityBody.bulkAction.results[0]?.issue?.values?.priority).toBe("P0");

    const priorityUnchanged = await requestJson(organizationIssuesBulkUrl(organizationSlug), {
      method: "POST",
      headers,
      body: {
        action: "set_priority",
        priority: "P0",
        issues: [target],
      },
    });
    expect(priorityUnchanged.status).toBe(200);
    const priorityUnchangedBody = (await priorityUnchanged.json()) as {
      bulkAction: { unchanged: number; succeeded: number };
    };
    expect(priorityUnchangedBody.bulkAction.unchanged).toBe(1);
    expect(priorityUnchangedBody.bulkAction.succeeded).toBe(0);

    const issueTypeResponse = await requestJson(organizationIssuesBulkUrl(organizationSlug), {
      method: "POST",
      headers,
      body: {
        action: "set_issue_type",
        issueType: "qa_failure",
        issues: [target],
      },
    });
    expect(issueTypeResponse.status).toBe(200);
    const issueTypeBody = (await issueTypeResponse.json()) as {
      bulkAction: {
        succeeded: number;
        results: Array<{ outcome: string; issue?: { issueType: string } }>;
      };
    };
    expect(issueTypeBody.bulkAction.succeeded).toBe(1);
    expect(issueTypeBody.bulkAction.results[0]?.issue?.issueType).toBe("qa_failure");

    const feedResponse = await requestJson(
      `${issueSheetUrl(organizationSlug, project.id)}/${created.issue.id}/feed`,
      { headers },
    );
    expect(feedResponse.status).toBe(200);
    const feedBody = (await feedResponse.json()) as {
      items: Array<
        | {
            kind: "activity";
            activity: {
              type: string;
              previousPriority?: string | null;
              nextPriority?: string;
              previousIssueType?: string;
              nextIssueType?: string;
            };
          }
        | { kind: "comment_thread" }
      >;
    };
    const activityTypes = feedBody.items
      .filter((item): item is Extract<(typeof feedBody.items)[number], { kind: "activity" }> => {
        return item.kind === "activity";
      })
      .map((item) => item.activity.type);
    expect(activityTypes).toContain("priority_changed");
    expect(activityTypes).toContain("issue_type_changed");
    expect(activityTypes).toContain("assignee_changed");

    const unassignResponse = await requestJson(organizationIssuesBulkUrl(organizationSlug), {
      method: "POST",
      headers,
      body: {
        action: "unassign",
        issues: [target],
      },
    });
    expect(unassignResponse.status).toBe(200);
    const unassignBody = (await unassignResponse.json()) as {
      bulkAction: {
        succeeded: number;
        results: Array<{ issue?: { assigneeUserId: string | null } }>;
      };
    };
    expect(unassignBody.bulkAction.succeeded).toBe(1);
    expect(unassignBody.bulkAction.results[0]?.issue?.assigneeUserId).toBeNull();
  });

  it("maps assignee_not_assignable on bulk assign without aborting siblings", async () => {
    const { identity, project, user } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const outsider = projectFixture.createWorkosIdentityForOrganization(
      identity.organization,
      "translator",
    );
    await projectFixture.authHeadersFor(outsider);
    const outsiderUserId = await projectFixture.getLocalUserId(outsider.user.workosUserId);

    const createAssignable = await requestJson(issueSheetUrl(organizationSlug, project.id), {
      method: "POST",
      headers,
      body: { title: "Assignable bulk", issueType: "general_question" },
    });
    expect(createAssignable.status).toBe(201);
    const assignableIssue = (await createAssignable.json()) as { issue: { id: string } };

    const createRejected = await requestJson(issueSheetUrl(organizationSlug, project.id), {
      method: "POST",
      headers,
      body: { title: "Rejected bulk", issueType: "general_question" },
    });
    expect(createRejected.status).toBe(201);
    const rejectedIssue = (await createRejected.json()) as { issue: { id: string } };

    const bulkResponse = await requestJson(organizationIssuesBulkUrl(organizationSlug), {
      method: "POST",
      headers,
      body: {
        action: "assign",
        assigneeUserId: outsiderUserId,
        issues: [
          { projectId: project.id, issueId: assignableIssue.issue.id },
          { projectId: project.id, issueId: rejectedIssue.issue.id },
        ],
      },
    });
    expect(bulkResponse.status).toBe(200);
    const bulkBody = (await bulkResponse.json()) as {
      bulkAction: {
        succeeded: number;
        failed: number;
        results: Array<{ issueId: string; outcome: string; error?: { code: string } }>;
      };
    };
    expect(bulkBody.bulkAction.succeeded).toBe(0);
    expect(bulkBody.bulkAction.failed).toBe(2);
    expect(bulkBody.bulkAction.results.every((result) => result.outcome === "failed")).toBe(true);
    expect(
      bulkBody.bulkAction.results.every(
        (result) => result.error?.code === "assignee_not_assignable",
      ),
    ).toBe(true);

    const validAssign = await requestJson(organizationIssuesBulkUrl(organizationSlug), {
      method: "POST",
      headers,
      body: {
        action: "assign",
        assigneeUserId: user.id,
        issues: [
          { projectId: project.id, issueId: assignableIssue.issue.id },
          { projectId: project.id, issueId: "00000000-0000-4000-8000-000000000099" },
        ],
      },
    });
    expect(validAssign.status).toBe(200);
    const validAssignBody = (await validAssign.json()) as {
      bulkAction: {
        succeeded: number;
        failed: number;
        results: Array<{ issueId: string; outcome: string; error?: { code: string } }>;
      };
    };
    expect(validAssignBody.bulkAction.succeeded).toBe(1);
    expect(validAssignBody.bulkAction.failed).toBe(1);
    expect(
      validAssignBody.bulkAction.results.find(
        (result) => result.issueId === assignableIssue.issue.id,
      ),
    ).toMatchObject({ outcome: "updated" });
    expect(
      validAssignBody.bulkAction.results.find(
        (result) => result.issueId === "00000000-0000-4000-8000-000000000099",
      ),
    ).toMatchObject({
      outcome: "failed",
      error: { code: "issue_not_found" },
    });
  });
});

describe("Organization issue-sheet GET", () => {
  function organizationIssueSheetUrl(organizationSlug: string, issueId: string) {
    return `/api/orgs/${encodeURIComponent(organizationSlug)}/issue-sheet/${encodeURIComponent(issueId)}`;
  }

  it("returns one authorized issue by id", async () => {
    const { identity, project } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const createResponse = await requestJson(issueSheetUrl(organizationSlug, project.id), {
      method: "POST",
      headers,
      body: {
        title: "Resolvable issue",
        issueType: "general_question",
      },
    });
    expect(createResponse.status).toBe(201);
    const created = (await createResponse.json()) as {
      issue: { id: string; identifier: string; title: string };
    };

    const response = await requestJson(
      organizationIssueSheetUrl(organizationSlug, created.issue.identifier),
      { headers },
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      issue: {
        id: string;
        identifier: string;
        title: string;
        projectId: string;
        projectName: string;
      };
    };
    expect(body.issue).toMatchObject({
      id: created.issue.id,
      identifier: created.issue.identifier,
      title: "Resolvable issue",
      projectId: project.id,
    });
    expect(body.issue.projectName).toBeTruthy();
  });

  it("returns 404 for missing issues", async () => {
    const { identity } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const response = await requestJson(organizationIssueSheetUrl(organizationSlug, "ZZZ-99999"), {
      headers,
    });
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: "issue_not_found" });
  });

  it("returns 404 for cross-workspace access", async () => {
    const owner = await projectFixture.createStoredProjectFixture();
    const outsider = await projectFixture.createStoredProjectFixture();
    const ownerHeaders = await projectFixture.authHeadersFor(owner.identity);
    const outsiderHeaders = await projectFixture.authHeadersFor(outsider.identity);
    const ownerSlug = owner.identity.organization.slug ?? "missing-slug";

    const createResponse = await requestJson(issueSheetUrl(ownerSlug, owner.project.id), {
      method: "POST",
      headers: ownerHeaders,
      body: {
        title: "Other workspace issue",
        issueType: "general_question",
      },
    });
    expect(createResponse.status).toBe(201);
    const created = (await createResponse.json()) as { issue: { id: string; identifier: string } };

    const response = await requestJson(
      organizationIssueSheetUrl(ownerSlug, created.issue.identifier),
      {
        headers: outsiderHeaders,
      },
    );
    expect(response.status).toBe(404);
  });
});
