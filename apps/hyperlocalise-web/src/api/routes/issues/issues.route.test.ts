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
        sortDir: "asc",
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
        sortDir: "asc",
        limit: "2",
        offset: "2",
      },
    });
    const pageTwoBody = (await pageTwo.json()) as ListBody;
    expect(pageTwoBody.issues.map((issue) => issue.title)).toEqual(["My assigned open"]);
    expect(new Set([...sortedBody.issues, ...pageTwoBody.issues].map((issue) => issue.id)).size).toBe(
      3,
    );
  });
});
