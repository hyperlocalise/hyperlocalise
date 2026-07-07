import "dotenv/config";

import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { app } from "@/api/app";
import { db } from "@/lib/database";

import { createProjectTestFixture } from "./project.fixture";

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

type IssueResponse = {
  issue: {
    id: string;
    title: string;
    issueType: string;
    status: string;
    targetLocale: string | null;
    values: Record<string, unknown>;
  };
};

type IssueSheetListResponse = {
  issues: { id: string }[];
  columns: { key: string }[];
  summary: { open: number };
};

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  vi.clearAllMocks();
  await projectFixture.cleanup();
});

function issueSheetUrl(organizationSlug: string, projectId: string, suffix = "") {
  return `/api/orgs/${encodeURIComponent(organizationSlug)}/projects/${encodeURIComponent(projectId)}/issue-sheet${suffix}`;
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

describe("Issue Sheet routes", () => {
  it("creates, lists, updates, and enriches generic issue rows", async () => {
    const { identity, project } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const createResponse = await requestJson(issueSheetUrl(organizationSlug, project.id), {
      method: "POST",
      headers,
      body: {
        title: "Source string needs context",
        description: "The CTA is ambiguous.",
        issueType: "context_request",
        targetLocale: "de-DE",
        sourcePath: "messages/home.json",
        segmentId: "cta.save",
        linkKind: "cat_segment",
        linkLabel: "Open in CAT",
        externalRef: "cat:home:de-DE:cta.save",
        priority: "P1",
      },
    });

    expect(createResponse.status).toBe(201);
    const createdBody = (await createResponse.json()) as IssueResponse;
    expect(createdBody.issue).toMatchObject({
      title: "Source string needs context",
      issueType: "context_request",
      status: "open",
      targetLocale: "de-DE",
      values: { priority: "P1" },
    });

    const listResponse = await requestJson(issueSheetUrl(organizationSlug, project.id), {
      headers,
      query: { view: "all_open" },
    });

    expect(listResponse.status).toBe(200);
    const listBody = (await listResponse.json()) as IssueSheetListResponse;
    expect(listBody.issues).toHaveLength(1);
    expect(listBody.summary.open).toBe(1);
    expect(listBody.columns.map((column) => column.key)).toEqual([
      "priority",
      "owner_note",
      "context",
    ]);

    const viewWithStatusResponse = await requestJson(issueSheetUrl(organizationSlug, project.id), {
      headers,
      query: { view: "all_open", status: "resolved" },
    });

    expect(viewWithStatusResponse.status).toBe(200);
    const viewWithStatusBody = (await viewWithStatusResponse.json()) as IssueSheetListResponse;
    expect(viewWithStatusBody.issues).toHaveLength(1);

    const issueId = createdBody.issue.id;
    const updateResponse = await requestJson(
      issueSheetUrl(organizationSlug, project.id, `/${issueId}`),
      {
        method: "PATCH",
        headers,
        body: { status: "in_progress" },
      },
    );

    expect(updateResponse.status).toBe(200);
    const updatedBody = (await updateResponse.json()) as IssueResponse;
    expect(updatedBody.issue.status).toBe("in_progress");

    const columnResponse = await requestJson(
      issueSheetUrl(organizationSlug, project.id, "/columns"),
      {
        method: "POST",
        headers,
        body: {
          key: "sprint",
          label: "Sprint",
          type: "select",
          config: { options: [{ id: "S24", label: "S24" }] },
        },
      },
    );

    expect(columnResponse.status).toBe(201);

    const valueResponse = await requestJson(
      issueSheetUrl(organizationSlug, project.id, `/${issueId}/values`),
      {
        method: "PATCH",
        headers,
        body: { columnKey: "sprint", value: "S24" },
      },
    );

    expect(valueResponse.status).toBe(200);
  });

  it("deduplicates open rows for the same external reference", async () => {
    const { identity, project } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";
    const payload = {
      title: "Repeated CAT context request",
      issueType: "context_request",
      targetLocale: "fr-FR",
      sourcePath: "messages/home.json",
      segmentId: "headline",
      externalRef: "cat:home:fr-FR:headline",
    };

    const first = await requestJson(issueSheetUrl(organizationSlug, project.id), {
      method: "POST",
      headers,
      body: payload,
    });
    const second = await requestJson(issueSheetUrl(organizationSlug, project.id), {
      method: "POST",
      headers,
      body: payload,
    });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    const firstBody = (await first.json()) as IssueResponse;
    const secondBody = (await second.json()) as IssueResponse;
    expect(secondBody.issue.id).toBe(firstBody.issue.id);

    const listResponse = await requestJson(issueSheetUrl(organizationSlug, project.id), {
      headers,
      query: { status: "all" },
    });
    const listBody = (await listResponse.json()) as IssueSheetListResponse;
    expect(listBody.issues).toHaveLength(1);
  });

  it("returns a resolved row for repeated external references", async () => {
    const { identity, project } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";
    const payload = {
      title: "Resolved CAT context request",
      issueType: "context_request",
      targetLocale: "fr-FR",
      sourcePath: "messages/home.json",
      segmentId: "headline",
      externalRef: "cat:home:fr-FR:resolved-headline",
    };

    const first = await requestJson(issueSheetUrl(organizationSlug, project.id), {
      method: "POST",
      headers,
      body: payload,
    });

    expect(first.status).toBe(201);
    const firstBody = (await first.json()) as IssueResponse;

    const resolveResponse = await requestJson(
      issueSheetUrl(organizationSlug, project.id, `/${firstBody.issue.id}`),
      {
        method: "PATCH",
        headers,
        body: { status: "resolved" },
      },
    );
    expect(resolveResponse.status).toBe(200);

    const repeated = await requestJson(issueSheetUrl(organizationSlug, project.id), {
      method: "POST",
      headers,
      body: payload,
    });

    expect(repeated.status).toBe(201);
    const repeatedBody = (await repeated.json()) as IssueResponse;
    expect(repeatedBody.issue.id).toBe(firstBody.issue.id);
    expect(repeatedBody.issue.status).toBe("resolved");

    const listResponse = await requestJson(issueSheetUrl(organizationSlug, project.id), {
      headers,
      query: { status: "all" },
    });
    const listBody = (await listResponse.json()) as IssueSheetListResponse;
    expect(listBody.issues).toHaveLength(1);
  });
});
