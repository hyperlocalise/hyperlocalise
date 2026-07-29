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

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { app } from "@/api/app";
import { db } from "@/lib/database";

import { createProjectTestFixture } from "../project/project.fixture";

const { resolveApiAuthContextFromSessionMock, workspaceIssuesFlagRunMock } = vi.hoisted(() => ({
  resolveApiAuthContextFromSessionMock: vi.fn(
    (options) =>
      globalThis.__resolveTestApiAuthContextFromSession?.(options) ??
      globalThis.__testApiAuthContext ??
      null,
  ),
  workspaceIssuesFlagRunMock: vi.fn(async () => true),
}));

vi.mock("@/api/auth/workos-session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/auth/workos-session")>();
  return {
    ...actual,
    resolveApiAuthContextFromSession: resolveApiAuthContextFromSessionMock,
  };
});

vi.mock("@/lib/flags/workspace-flags", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/flags/workspace-flags")>();
  return {
    ...actual,
    workspaceIssuesFlag: { run: workspaceIssuesFlagRunMock },
  };
});

const projectFixture = createProjectTestFixture();

beforeAll(async () => {
  await db.$client.query("select 1");
});

beforeEach(() => {
  workspaceIssuesFlagRunMock.mockResolvedValue(true);
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
  it("denies organization issues access when the feature flag is disabled", async () => {
    workspaceIssuesFlagRunMock.mockResolvedValue(false);
    const { identity } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const response = await requestJson(organizationIssuesUrl(organizationSlug), {
      headers,
      query: { view: "all_open" },
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "feature_unavailable",
    });
  });

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
    expect(sortedBody.issues.map((issue) => issue.title)).toEqual([
      "QA unassigned open",
      "Source context open",
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
    expect(pageTwoBody.issues.map((issue) => issue.title)).toEqual(["My assigned open"]);
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
    const created = (await createResponse.json()) as { issue: { id: string; title: string } };

    const response = await requestJson(
      organizationIssueSheetUrl(organizationSlug, created.issue.id),
      { headers },
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      issue: { id: string; title: string; projectId: string; projectName: string };
    };
    expect(body.issue).toMatchObject({
      id: created.issue.id,
      title: "Resolvable issue",
      projectId: project.id,
    });
    expect(body.issue.projectName).toBeTruthy();
  });

  it("returns 404 for missing issues", async () => {
    const { identity } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const response = await requestJson(
      organizationIssueSheetUrl(organizationSlug, "00000000-0000-4000-8000-000000000000"),
      { headers },
    );
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
    const created = (await createResponse.json()) as { issue: { id: string } };

    const response = await requestJson(organizationIssueSheetUrl(ownerSlug, created.issue.id), {
      headers: outsiderHeaders,
    });
    expect(response.status).toBe(404);
  });
});
