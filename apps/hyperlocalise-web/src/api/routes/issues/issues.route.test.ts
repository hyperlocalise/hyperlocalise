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

describe("Organization issues routes", () => {
  it("lists issues across accessible projects", async () => {
    const { identity, project } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const createResponse = await requestJson(
      `/api/orgs/${encodeURIComponent(organizationSlug)}/projects/${encodeURIComponent(project.id)}/issue-sheet`,
      {
        method: "POST",
        headers,
        body: {
          title: "Workspace-wide issue",
          issueType: "general_question",
        },
      },
    );
    expect(createResponse.status).toBe(201);

    const listResponse = await requestJson(organizationIssuesUrl(organizationSlug), {
      headers,
      query: { view: "all_open" },
    });

    expect(listResponse.status).toBe(200);
    const listBody = (await listResponse.json()) as {
      issues: Array<{ title: string; projectId: string; projectName: string }>;
      total: number;
      summary: { open: number };
    };
    expect(listBody.total).toBe(1);
    expect(listBody.summary.open).toBe(1);
    expect(listBody.issues[0]).toMatchObject({
      title: "Workspace-wide issue",
      projectId: project.id,
      projectName: project.name,
    });
  });
});
