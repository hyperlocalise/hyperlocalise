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

import { testClient } from "hono/testing";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  resolveApiAuthContextFromSessionMock: vi.fn(
    (options) =>
      globalThis.__resolveTestApiAuthContextFromSession?.(options) ??
      globalThis.__testApiAuthContext ??
      null,
  ),
  loadLinearClient: vi.fn(),
  loadLinearQaFindings: vi.fn(),
  canAccessProject: vi.fn(),
  listTeams: vi.fn(),
  createIssue: vi.fn(),
}));

vi.mock("@/api/auth/workos-session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/auth/workos-session")>();
  return {
    ...actual,
    resolveApiAuthContextFromSession: mocks.resolveApiAuthContextFromSessionMock,
  };
});

vi.mock("@/api/auth/team-access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/auth/team-access")>();
  return {
    ...actual,
    canAccessProject: (...args: unknown[]) => mocks.canAccessProject(...args),
  };
});

vi.mock("@/lib/linear/credentials", () => ({
  loadLinearClient: (...args: unknown[]) => mocks.loadLinearClient(...args),
}));

vi.mock("@/lib/linear/qa-finding-issues", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/linear/qa-finding-issues")>();
  return {
    ...actual,
    loadLinearQaFindings: (...args: unknown[]) => mocks.loadLinearQaFindings(...args),
  };
});

import { createApp } from "@/api/app";
import { createAuthTestFixture } from "@/api/test-auth.fixture";
import type { AppType } from "@/api/typed-app";
import { db } from "@/lib/database/client";
import { LINEAR_QA_FINDING_ISSUES_MAX } from "@/lib/linear/qa-finding-issues-limits";
import { err, ok } from "@/lib/primitives/result/results";

const client = testClient<AppType>(createApp());
const fixture = createAuthTestFixture();

const accessibleFinding = {
  id: "00000000-0000-4000-8000-000000000001",
  projectId: "project_open",
  projectName: "Mobile app",
  sourcePath: "locales/en.json",
  key: "dose.reminder",
  targetLocale: "de-DE",
  checkType: "estimated_quality",
  severity: "error",
  message: "The dosage changed.",
  sourceText: "Take 5 mg daily.",
  targetText: "Täglich 50 mg einnehmen.",
};

const foreignFinding = {
  ...accessibleFinding,
  id: "00000000-0000-4000-8000-000000000002",
  projectId: "project_hidden",
  projectName: "Hidden app",
};

function linearClient() {
  return {
    listTeams: mocks.listTeams,
    createIssue: mocks.createIssue,
  };
}

async function reviewerHeaders() {
  const identity = fixture.createWorkosIdentityWithRole("reviewer");
  const headers = await fixture.authHeadersFor(identity);
  return { identity, headers, organizationSlug: identity.organization.slug ?? "" };
}

describe("linearRoutes", () => {
  beforeAll(async () => {
    await db.$client.query("select 1");
  });

  beforeEach(() => {
    mocks.loadLinearClient.mockReset();
    mocks.loadLinearQaFindings.mockReset();
    mocks.canAccessProject.mockReset();
    mocks.listTeams.mockReset();
    mocks.createIssue.mockReset();
    mocks.loadLinearClient.mockResolvedValue(
      ok({ client: linearClient(), workosUserId: "user_1" }),
    );
    mocks.listTeams.mockResolvedValue(
      ok([
        { id: "team_eng", key: "ENG", name: "Engineering" },
        { id: "team_loc", key: "LOC", name: "Localisation" },
      ]),
    );
    mocks.createIssue.mockResolvedValue(
      ok({
        id: "i1",
        identifier: "LOC-1",
        title: "Estimated quality in de-DE: dose.reminder",
        url: "https://linear.app/i/LOC-1",
      }),
    );
    mocks.canAccessProject.mockImplementation(async (_auth: unknown, projectId: string) =>
      projectId === "project_hidden" ? null : { id: projectId },
    );
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await fixture.cleanup();
  });

  it("forbids listing Linear teams without reviews:approve", async () => {
    for (const role of ["translator", "member", "developer"] as const) {
      const identity = fixture.createWorkosIdentityWithRole(role);
      const headers = await fixture.authHeadersFor(identity);
      const response = await client.api.orgs[":organizationSlug"].linear.teams.$get(
        { param: { organizationSlug: identity.organization.slug ?? "" } },
        { headers },
      );
      expect({ role, status: response.status }).toEqual({ role, status: 403 });
      await expect(response.json()).resolves.toMatchObject({ error: "forbidden" });
    }
    expect(mocks.loadLinearClient).not.toHaveBeenCalled();
  });

  it("lists Linear teams for a reviewer", async () => {
    const { identity, headers, organizationSlug } = await reviewerHeaders();

    const response = await client.api.orgs[":organizationSlug"].linear.teams.$get(
      { param: { organizationSlug } },
      { headers },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      teams: [
        { id: "team_eng", key: "ENG", name: "Engineering" },
        { id: "team_loc", key: "LOC", name: "Localisation" },
      ],
    });
    expect(mocks.loadLinearClient).toHaveBeenCalledWith({
      localOrganizationId: globalThis.__testApiAuthContext!.organization.localOrganizationId,
      workosUserId: identity.user.workosUserId,
    });
  });

  it("maps a missing Linear connection to 400", async () => {
    mocks.loadLinearClient.mockResolvedValue(
      err({
        code: "linear_not_connected",
        message: "Connect Linear in Integrations before using it.",
      }),
    );
    const { headers, organizationSlug } = await reviewerHeaders();

    const response = await client.api.orgs[":organizationSlug"].linear.teams.$get(
      { param: { organizationSlug } },
      { headers },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "linear_not_connected" });
  });

  it("maps an unavailable Linear pipe to 503", async () => {
    mocks.loadLinearClient.mockResolvedValue(
      err({
        code: "linear_pipes_unavailable",
        message: "Linear isn't available right now.",
      }),
    );
    const { headers, organizationSlug } = await reviewerHeaders();

    const response = await client.api.orgs[":organizationSlug"].linear.teams.$get(
      { param: { organizationSlug } },
      { headers },
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: "linear_pipes_unavailable" });
  });

  it("forbids filing Linear issues without reviews:approve", async () => {
    const identity = fixture.createWorkosIdentityWithRole("translator");
    const headers = await fixture.authHeadersFor(identity);

    const response = await client.api.orgs[":organizationSlug"].linear["qa-finding-issues"].$post(
      {
        param: { organizationSlug: identity.organization.slug ?? "" },
        json: { teamId: "team_loc", findingIds: [accessibleFinding.id] },
      },
      { headers },
    );

    expect(response.status).toBe(403);
    expect(mocks.loadLinearQaFindings).not.toHaveBeenCalled();
    expect(mocks.createIssue).not.toHaveBeenCalled();
  });

  it("rejects an empty team or finding list", async () => {
    const { headers, organizationSlug } = await reviewerHeaders();

    const response = await client.api.orgs[":organizationSlug"].linear["qa-finding-issues"].$post(
      {
        param: { organizationSlug },
        json: { teamId: "  ", findingIds: [] },
      },
      { headers },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "invalid_linear_issue_payload" });
    expect(mocks.loadLinearQaFindings).not.toHaveBeenCalled();
  });

  it("rejects more findings than one request may file", async () => {
    const { headers, organizationSlug } = await reviewerHeaders();
    const findingIds = Array.from(
      { length: LINEAR_QA_FINDING_ISSUES_MAX + 1 },
      (_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    );

    const response = await client.api.orgs[":organizationSlug"].linear["qa-finding-issues"].$post(
      { param: { organizationSlug }, json: { teamId: "team_loc", findingIds } },
      { headers },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "invalid_linear_issue_payload" });
  });

  it("does not file issues when none of the findings are in a project the reviewer can access", async () => {
    mocks.loadLinearQaFindings.mockResolvedValue([foreignFinding]);
    const { headers, organizationSlug } = await reviewerHeaders();

    const response = await client.api.orgs[":organizationSlug"].linear["qa-finding-issues"].$post(
      {
        param: { organizationSlug },
        json: { teamId: "team_loc", findingIds: [foreignFinding.id] },
      },
      { headers },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "linear_findings_unavailable" });
    expect(mocks.loadLinearClient).not.toHaveBeenCalled();
    expect(mocks.createIssue).not.toHaveBeenCalled();
  });

  it("files issues only for findings in projects the reviewer can access", async () => {
    mocks.loadLinearQaFindings.mockResolvedValue([accessibleFinding, foreignFinding]);
    const { identity, headers, organizationSlug } = await reviewerHeaders();

    const response = await client.api.orgs[":organizationSlug"].linear["qa-finding-issues"].$post(
      {
        param: { organizationSlug },
        json: {
          teamId: "team_loc",
          findingIds: [accessibleFinding.id, foreignFinding.id],
        },
      },
      { headers },
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      issues: [
        {
          findingId: accessibleFinding.id,
          identifier: "LOC-1",
          url: "https://linear.app/i/LOC-1",
        },
      ],
      failedCount: 0,
      skippedCount: 1,
    });
    expect(mocks.loadLinearQaFindings).toHaveBeenCalledWith({
      organizationId: globalThis.__testApiAuthContext!.organization.localOrganizationId,
      findingIds: [accessibleFinding.id, foreignFinding.id],
    });
    expect(mocks.loadLinearClient).toHaveBeenCalledWith({
      localOrganizationId: globalThis.__testApiAuthContext!.organization.localOrganizationId,
      workosUserId: identity.user.workosUserId,
    });
    expect(mocks.createIssue).toHaveBeenCalledTimes(1);
    expect(mocks.createIssue.mock.calls[0]![0]).toMatchObject({
      teamId: "team_loc",
      priority: 2,
    });
  });

  it("maps a Linear rate limit to 429 when no issue is created", async () => {
    mocks.loadLinearQaFindings.mockResolvedValue([accessibleFinding]);
    mocks.createIssue.mockResolvedValue(
      err({ code: "linear_rate_limited", message: "Slow down." }),
    );
    const { headers, organizationSlug } = await reviewerHeaders();

    const response = await client.api.orgs[":organizationSlug"].linear["qa-finding-issues"].$post(
      {
        param: { organizationSlug },
        json: { teamId: "team_loc", findingIds: [accessibleFinding.id] },
      },
      { headers },
    );

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({ error: "linear_rate_limited" });
  });
});
