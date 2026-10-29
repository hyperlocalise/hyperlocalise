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

import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { generateMcpToken, hashMcpToken } from "@/api/auth/mcp";
import { createMcpTestApp } from "@/api/routes/mcp/mcp.fixture";
import { insertPublicTranslationJob } from "@/api/routes/public-jobs/public-jobs.fixture";
import { createProjectTestFixture } from "@/api/routes/project/project.fixture";
import { db, schema } from "@/lib/database/client";
import { GoSvcClientError } from "@/lib/go-svc/go-svc-client";
import { upsertExternalTmsJobRecords } from "@/lib/projects/external-tms/external-tms-sync-service";

const { resolveApiAuthContextFromSessionMock, workspaceReportsFlagRunMock } = vi.hoisted(() => ({
  resolveApiAuthContextFromSessionMock: vi.fn(
    (options) =>
      globalThis.__resolveTestApiAuthContextFromSession?.(options) ??
      globalThis.__testApiAuthContext ??
      null,
  ),
  workspaceReportsFlagRunMock: vi.fn(async () => true),
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
    workspaceReportsFlag: { run: workspaceReportsFlagRunMock },
  };
});

const { reportsInternalMock } = vi.hoisted(() => ({ reportsInternalMock: vi.fn() }));

vi.mock("@/lib/go-svc/go-svc-server-client", () => ({
  createGoSvcServerClient: () => ({ reports: { internal: reportsInternalMock } }),
}));

const mcpApp = createMcpTestApp();
const fixture = createProjectTestFixture();

async function authenticatedMcpHeaders(identity = fixture.createWorkosIdentity()) {
  const headers = await fixture.authHeadersFor(identity);

  const accessToken = generateMcpToken();
  const refreshToken = generateMcpToken();

  const auth = globalThis.__testApiAuthContext;
  if (!auth) {
    throw new Error("expected test auth context");
  }

  await db.insert(schema.mcpSessions).values({
    userId: auth.user.localUserId,
    organizationId: auth.organization.localOrganizationId,
    scope: "mcp",
    accessTokenHash: hashMcpToken(accessToken),
    refreshTokenHash: hashMcpToken(refreshToken),
    expiresAt: new Date(Date.now() + 60_000),
    refreshExpiresAt: new Date(Date.now() + 120_000),
  });

  return {
    ...headers,
    authorization: `Bearer ${accessToken}`,
  };
}

async function callMcpTool(
  headers: Record<string, string>,
  name: string,
  args: Record<string, unknown> = {},
) {
  return mcpApp.request("http://localhost/mcp", {
    method: "POST",
    headers: {
      ...headers,
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name,
        arguments: args,
      },
    }),
  });
}

async function readToolResult<T>(response: Response) {
  expect(response.status).toBe(200);

  const body = (await response.json()) as {
    result?: {
      isError?: boolean;
      content?: Array<{ type: string; text?: string }>;
    };
  };

  const text = body.result?.content?.[0]?.text;
  expect(text).toBeDefined();

  return {
    isError: body.result?.isError === true,
    output: JSON.parse(text!) as T,
  };
}

async function insertNativeJob(input: {
  organizationId: string;
  projectId?: string | null;
  createdByUserId?: string | null;
  ownerUserId?: string | null;
  status?: (typeof schema.jobs.$inferInsert)["status"];
  inputPayload?: (typeof schema.jobs.$inferInsert)["inputPayload"];
  dueAt?: Date | null;
}) {
  const [job] = await db
    .insert(schema.jobs)
    .values({
      id: `job_${randomUUID()}`,
      organizationId: input.organizationId,
      projectId: input.projectId ?? null,
      createdByUserId: input.createdByUserId ?? null,
      ownerUserId: input.ownerUserId ?? null,
      kind: "translation",
      status: input.status ?? "queued",
      dueAt: input.dueAt ?? null,
      inputPayload: input.inputPayload ?? {
        sourceText: "Hello",
        sourceLocale: "en-US",
        targetLocales: ["fr-FR"],
        metadata: { title: "Launch copy" },
      },
    })
    .returning();

  if (!job) {
    throw new Error("expected native job");
  }

  return job;
}

describe("MCP project manager tools", () => {
  beforeAll(async () => {
    await db.$client.query("select 1");
  });

  beforeEach(() => {
    workspaceReportsFlagRunMock.mockResolvedValue(true);
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  it("advertises the new project-manager tools", async () => {
    const headers = await authenticatedMcpHeaders();

    const response = await mcpApp.request("http://localhost/mcp", {
      method: "POST",
      headers: {
        ...headers,
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {},
      }),
    });

    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      result?: { tools?: Array<{ name: string }> };
    };
    const names = new Set(body.result?.tools?.map((tool) => tool.name));

    expect(names.has("list_open_jobs")).toBe(true);
    expect(names.has("update_job")).toBe(true);
    expect(names.has("cancel_job")).toBe(true);
    expect(names.has("get_report")).toBe(true);
    expect(names.has("list_project_members")).toBe(true);
  });

  it("lists open jobs, excludes succeeded, and hides failed when asked", async () => {
    const stored = await fixture.createStoredProjectFixture();
    const headers = await authenticatedMcpHeaders(stored.identity);

    const queued = await insertPublicTranslationJob({
      organizationId: stored.organization.id,
      projectId: stored.project.id,
      status: "queued",
    });
    const failed = await insertPublicTranslationJob({
      organizationId: stored.organization.id,
      projectId: stored.project.id,
      status: "failed",
      lastError: "provider timeout",
    });
    await insertPublicTranslationJob({
      organizationId: stored.organization.id,
      projectId: stored.project.id,
      status: "succeeded",
      completedAt: new Date("2026-03-01T12:00:00.000Z"),
    });

    const withFailed = await readToolResult<{
      jobs?: Array<{ id: string; status: string }>;
    }>(await callMcpTool(headers, "list_open_jobs", { projectId: stored.project.id }));
    const withoutFailed = await readToolResult<{
      jobs?: Array<{ id: string; status: string }>;
    }>(
      await callMcpTool(headers, "list_open_jobs", {
        projectId: stored.project.id,
        includeFailed: false,
      }),
    );

    expect(withFailed.isError).toBe(false);
    expect(withFailed.output.jobs?.map((job) => job.id).sort()).toEqual(
      [queued.id, failed.id].sort(),
    );
    expect(withoutFailed.output.jobs?.map((job) => job.id)).toEqual([queued.id]);
  });

  it("filters list_open_jobs by owner and marks overdue provider due dates", async () => {
    const stored = await fixture.createStoredProjectFixture();
    const headers = await authenticatedMcpHeaders(stored.identity);

    const mine = await insertPublicTranslationJob({
      organizationId: stored.organization.id,
      projectId: stored.project.id,
      status: "queued",
    });
    const unassigned = await insertPublicTranslationJob({
      organizationId: stored.organization.id,
      projectId: stored.project.id,
      status: "running",
    });

    await db
      .update(schema.jobs)
      .set({ ownerUserId: stored.user.id })
      .where(eq(schema.jobs.id, mine.id));

    await db.insert(schema.externalJobDetails).values({
      jobId: mine.id,
      organizationId: stored.organization.id,
      providerKind: "crowdin",
      externalJobId: `overdue_${randomUUID()}`,
      externalStatus: "in_progress",
      title: "Overdue Crowdin task",
      dueDate: new Date("2020-01-01T00:00:00.000Z"),
    });

    const mineOnly = await readToolResult<{
      jobs?: Array<{ id: string; overdue: boolean; dueDate: string | null }>;
    }>(
      await callMcpTool(headers, "list_open_jobs", {
        projectId: stored.project.id,
        owner: "me",
      }),
    );
    const unassignedOnly = await readToolResult<{
      jobs?: Array<{ id: string }>;
    }>(
      await callMcpTool(headers, "list_open_jobs", {
        projectId: stored.project.id,
        owner: "unassigned",
      }),
    );

    expect(mineOnly.output.jobs).toEqual([
      expect.objectContaining({
        id: mine.id,
        overdue: true,
        dueDate: "2020-01-01T00:00:00.000Z",
      }),
    ]);
    expect(unassignedOnly.output.jobs?.map((job) => job.id)).toEqual([unassigned.id]);
  });

  it("lists native job dueAt and prefers an external provider due date", async () => {
    const stored = await fixture.createStoredProjectFixture();
    const headers = await authenticatedMcpHeaders(stored.identity);

    const nativeDue = await insertNativeJob({
      organizationId: stored.organization.id,
      projectId: stored.project.id,
      dueAt: new Date("2020-02-01T00:00:00.000Z"),
    });
    const coalesced = await insertNativeJob({
      organizationId: stored.organization.id,
      projectId: stored.project.id,
      dueAt: new Date("2028-05-01T17:00:00.000Z"),
    });

    await db.insert(schema.externalJobDetails).values({
      jobId: coalesced.id,
      organizationId: stored.organization.id,
      providerKind: "crowdin",
      externalJobId: `native_due_${randomUUID()}`,
      externalStatus: "in_progress",
      title: "Provider due wins",
      dueDate: new Date("2020-01-15T00:00:00.000Z"),
    });

    const listed = await readToolResult<{
      jobs?: Array<{ id: string; overdue: boolean; dueDate: string | null }>;
    }>(await callMcpTool(headers, "list_open_jobs", { projectId: stored.project.id }));

    expect(listed.isError).toBe(false);
    expect(listed.output.jobs?.find((job) => job.id === nativeDue.id)).toEqual(
      expect.objectContaining({
        id: nativeDue.id,
        overdue: true,
        dueDate: "2020-02-01T00:00:00.000Z",
      }),
    );
    expect(listed.output.jobs?.find((job) => job.id === coalesced.id)).toEqual(
      expect.objectContaining({
        id: coalesced.id,
        overdue: true,
        dueDate: "2020-01-15T00:00:00.000Z",
      }),
    );
  });

  it("returns project_not_found for inaccessible list_open_jobs projects", async () => {
    const stored = await fixture.createStoredProjectFixture();
    const external = await fixture.createStoredProjectFixture();
    const headers = await authenticatedMcpHeaders(stored.identity);

    const result = await readToolResult<{ error?: string }>(
      await callMcpTool(headers, "list_open_jobs", { projectId: external.project.id }),
    );

    expect(result.isError).toBe(true);
    expect(result.output).toMatchObject({ error: "project_not_found" });
  });

  it("cancels a queued native job", async () => {
    const stored = await fixture.createStoredProjectFixture();
    const headers = await authenticatedMcpHeaders(stored.identity);
    const job = await insertNativeJob({
      organizationId: stored.organization.id,
      projectId: stored.project.id,
      createdByUserId: stored.user.id,
    });

    const result = await readToolResult<{ id?: string; status?: string }>(
      await callMcpTool(headers, "cancel_job", { jobId: job.id }),
    );

    expect(result.isError).toBe(false);
    expect(result.output).toEqual({ id: job.id, status: "cancelled" });

    const [cancelled] = await db
      .select({ status: schema.jobs.status })
      .from(schema.jobs)
      .where(eq(schema.jobs.id, job.id))
      .limit(1);
    expect(cancelled?.status).toBe("cancelled");

    const events = await db
      .select({ type: schema.jobEvents.type })
      .from(schema.jobEvents)
      .where(eq(schema.jobEvents.jobId, job.id));
    expect(events).toEqual([{ type: "job_cancelled" }]);
  });

  it("refuses to cancel provider-backed or completed jobs", async () => {
    const stored = await fixture.createStoredProjectFixture();
    const headers = await authenticatedMcpHeaders(stored.identity);

    await upsertExternalTmsJobRecords({
      organizationId: stored.organization.id,
      projectId: stored.project.id,
      providerKind: "crowdin",
      externalProjectId: "crowdin-project",
      tasks: [
        {
          externalJobId: "provider-review-job",
          externalStatus: "in_review",
          title: "Provider review task",
          assignedUsers: [],
        },
      ],
    });

    const [providerJob] = await db
      .select({ id: schema.jobs.id })
      .from(schema.jobs)
      .innerJoin(schema.externalJobDetails, eq(schema.externalJobDetails.jobId, schema.jobs.id))
      .where(
        and(
          eq(schema.jobs.organizationId, stored.organization.id),
          eq(schema.externalJobDetails.externalJobId, "provider-review-job"),
        ),
      )
      .limit(1);

    const succeeded = await insertNativeJob({
      organizationId: stored.organization.id,
      projectId: stored.project.id,
      status: "succeeded",
    });

    const provider = await readToolResult<{ error?: string }>(
      await callMcpTool(headers, "cancel_job", { jobId: providerJob!.id }),
    );
    const completed = await readToolResult<{ error?: string }>(
      await callMcpTool(headers, "cancel_job", { jobId: succeeded.id }),
    );
    const missing = await readToolResult<{ error?: string }>(
      await callMcpTool(headers, "cancel_job", { jobId: "job_does_not_exist" }),
    );

    expect(provider).toMatchObject({
      isError: true,
      output: { error: "job_action_unavailable" },
    });
    expect(completed).toMatchObject({
      isError: true,
      output: { error: "job_action_unavailable" },
    });
    expect(missing).toMatchObject({
      isError: true,
      output: { error: "job_not_found" },
    });
  });

  it("forbids read-only members from cancelling or updating jobs", async () => {
    const stored = await fixture.createStoredProjectFixture();
    const member = fixture.createWorkosIdentityForOrganization(
      stored.identity.organization,
      "member",
    );

    if (!stored.project.teamId) {
      throw new Error("expected project team");
    }

    await fixture.authHeadersFor(member);
    const memberAuth = globalThis.__testApiAuthContext;
    if (!memberAuth) {
      throw new Error("expected member auth context");
    }

    await db.insert(schema.teamMemberships).values({
      teamId: stored.project.teamId,
      userId: memberAuth.user.localUserId,
      role: "member",
    });

    const job = await insertNativeJob({
      organizationId: stored.organization.id,
      projectId: stored.project.id,
    });
    const headers = await authenticatedMcpHeaders(member);

    const cancel = await readToolResult<{ error?: string }>(
      await callMcpTool(headers, "cancel_job", { jobId: job.id }),
    );
    const update = await readToolResult<{ error?: string }>(
      await callMcpTool(headers, "update_job", { jobId: job.id, title: "Nope" }),
    );

    expect(cancel).toMatchObject({ isError: true, output: { error: "forbidden" } });
    expect(update).toMatchObject({ isError: true, output: { error: "forbidden" } });

    const [unchanged] = await db
      .select({ status: schema.jobs.status })
      .from(schema.jobs)
      .where(eq(schema.jobs.id, job.id))
      .limit(1);
    expect(unchanged?.status).toBe("queued");
  });

  it("updates a native job title and maps a local owner userId to WorkOS", async () => {
    const stored = await fixture.createStoredProjectFixture();
    const headers = await authenticatedMcpHeaders(stored.identity);
    const job = await insertNativeJob({
      organizationId: stored.organization.id,
      projectId: stored.project.id,
      createdByUserId: stored.user.id,
    });

    const result = await readToolResult<{
      job?: {
        id: string;
        title: string | null;
        owner: { userId: string; displayName: string } | null;
      };
    }>(
      await callMcpTool(headers, "update_job", {
        jobId: job.id,
        title: "Updated launch copy",
        ownerUserId: stored.user.id,
      }),
    );

    expect(result.isError).toBe(false);
    expect(result.output.job).toMatchObject({
      id: job.id,
      title: "Updated launch copy",
      owner: { userId: stored.user.id },
    });
  });

  it("sets and clears a native job dueAt through update_job", async () => {
    const stored = await fixture.createStoredProjectFixture();
    const headers = await authenticatedMcpHeaders(stored.identity);
    const job = await insertNativeJob({
      organizationId: stored.organization.id,
      projectId: stored.project.id,
      createdByUserId: stored.user.id,
    });
    const dueAt = "2028-05-01T17:00:00.000Z";

    const setDue = await readToolResult<{
      job?: { id: string; dueDate: string | null; overdue: boolean };
    }>(await callMcpTool(headers, "update_job", { jobId: job.id, dueAt }));

    expect(setDue.isError).toBe(false);
    expect(setDue.output.job).toMatchObject({
      id: job.id,
      dueDate: dueAt,
      overdue: false,
    });

    const [storedDue] = await db
      .select({ dueAt: schema.jobs.dueAt })
      .from(schema.jobs)
      .where(eq(schema.jobs.id, job.id))
      .limit(1);
    expect(storedDue?.dueAt?.toISOString()).toBe(dueAt);

    const cleared = await readToolResult<{
      job?: { id: string; dueDate: string | null; overdue: boolean };
    }>(await callMcpTool(headers, "update_job", { jobId: job.id, dueAt: null }));

    expect(cleared.isError).toBe(false);
    expect(cleared.output.job).toMatchObject({
      id: job.id,
      dueDate: null,
      overdue: false,
    });

    const [clearedDue] = await db
      .select({ dueAt: schema.jobs.dueAt })
      .from(schema.jobs)
      .where(eq(schema.jobs.id, job.id))
      .limit(1);
    expect(clearedDue?.dueAt).toBeNull();
  });

  it("rejects a date-only dueAt on update_job", async () => {
    const stored = await fixture.createStoredProjectFixture();
    const headers = await authenticatedMcpHeaders(stored.identity);
    const job = await insertNativeJob({
      organizationId: stored.organization.id,
      projectId: stored.project.id,
    });

    const response = await callMcpTool(headers, "update_job", {
      jobId: job.id,
      dueAt: "2026-05-01",
    });
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      result?: { isError?: boolean; content?: Array<{ type: string; text?: string }> };
    };
    const text = body.result?.content?.[0]?.text ?? "";

    expect(body.result?.isError).toBe(true);
    expect(text).toMatch(/dueAt|datetime|ISO/i);

    const [unchanged] = await db
      .select({ dueAt: schema.jobs.dueAt })
      .from(schema.jobs)
      .where(eq(schema.jobs.id, job.id))
      .limit(1);
    expect(unchanged?.dueAt).toBeNull();
  });

  it("returns owner_not_found for an unknown local user and refuses provider jobs", async () => {
    const stored = await fixture.createStoredProjectFixture();
    const headers = await authenticatedMcpHeaders(stored.identity);
    const job = await insertNativeJob({
      organizationId: stored.organization.id,
      projectId: stored.project.id,
    });

    await upsertExternalTmsJobRecords({
      organizationId: stored.organization.id,
      projectId: stored.project.id,
      providerKind: "crowdin",
      externalProjectId: "crowdin-project",
      tasks: [
        {
          externalJobId: "provider-job-1",
          externalStatus: "todo",
          title: "Provider task",
          assignedUsers: [],
        },
      ],
    });

    const [providerJob] = await db
      .select({ id: schema.jobs.id })
      .from(schema.jobs)
      .innerJoin(schema.externalJobDetails, eq(schema.externalJobDetails.jobId, schema.jobs.id))
      .where(
        and(
          eq(schema.jobs.organizationId, stored.organization.id),
          eq(schema.externalJobDetails.externalJobId, "provider-job-1"),
        ),
      )
      .limit(1);

    const unknownOwner = await readToolResult<{ error?: string }>(
      await callMcpTool(headers, "update_job", {
        jobId: job.id,
        ownerUserId: randomUUID(),
      }),
    );
    const provider = await readToolResult<{ error?: string }>(
      await callMcpTool(headers, "update_job", {
        jobId: providerJob!.id,
        title: "Should not apply",
      }),
    );

    expect(unknownOwner).toMatchObject({
      isError: true,
      output: { error: "owner_not_found" },
    });
    expect(provider).toMatchObject({
      isError: true,
      output: { error: "provider_job_not_updatable" },
    });
  });

  it("gates get_report on the workspace flag and billing, then reads through go-svc as the member", async () => {
    const stored = await fixture.createStoredProjectFixture();
    const translator = fixture.createWorkosIdentityForOrganization(
      stored.identity.organization,
      "translator",
    );
    reportsInternalMock.mockReset();
    reportsInternalMock.mockImplementation(async (kind: string) => ({
      kind,
      summary: { pendingDays: 0, oldestMarkedAt: null },
      stillUpdating: false,
      ...(kind === "activity"
        ? { activity: { current: { arrived: 0 }, series: [{ start: "2026-09-24" }] } }
        : { wordCounts: { rows: [], groupBy: "task", series: { split: "band", per: "month" } } }),
    }));

    workspaceReportsFlagRunMock.mockResolvedValueOnce(false);
    const adminHeaders = await authenticatedMcpHeaders(stored.identity);
    const adminAuth = globalThis.__testApiAuthContext;
    if (!adminAuth) {
      throw new Error("expected admin auth context");
    }
    const disabled = await readToolResult<{ error?: string }>(
      await callMcpTool(adminHeaders, "get_report", { report: "activity" }),
    );

    const translatorHeaders = await authenticatedMcpHeaders(translator);
    const refused = await readToolResult<{ error?: string }>(
      await callMcpTool(translatorHeaders, "get_report", { report: "costs" }),
    );
    // Neither reached go-svc.
    expect(reportsInternalMock).not.toHaveBeenCalled();

    // The same reads as the page: a kind, that tab's fields, and whether work is still counted.
    const activity = await readToolResult<{
      kind?: string;
      stillUpdating?: boolean;
      activity?: { current?: { arrived?: number }; series?: unknown[] };
    }>(await callMcpTool(adminHeaders, "get_report", { report: "activity", unit: "strings" }));
    const words = await readToolResult<{
      kind?: string;
      wordCounts?: { rows?: unknown[]; groupBy?: string };
    }>(
      await callMcpTool(adminHeaders, "get_report", {
        report: "words",
        groupBy: "task",
        split: "band",
        per: "month",
      }),
    );
    const invalid = await readToolResult<{ error?: string }>(
      await callMcpTool(adminHeaders, "get_report", {
        report: "words",
        from: "2026-06-10",
        to: "2026-06-01",
      }),
    );
    reportsInternalMock.mockRejectedValueOnce(
      new GoSvcClientError({
        code: "report_forbidden",
        message: "Reports require billing access",
        status: 403,
      }),
    );
    const refusedByGoSvc = await readToolResult<{ error?: string; message?: string }>(
      await callMcpTool(adminHeaders, "get_report", { report: "ai", groupBy: "model" }),
    );
    reportsInternalMock.mockRejectedValueOnce(
      new GoSvcClientError({
        code: "reports_busy",
        message: "Reports is busy; try again shortly",
        status: 503,
      }),
    );
    const busy = await readToolResult<{ error?: string; message?: string }>(
      await callMcpTool(adminHeaders, "get_report", { report: "time" }),
    );
    reportsInternalMock.mockRejectedValueOnce(
      new GoSvcClientError({ code: "network_error", message: "Unable to reach go-svc" }),
    );
    const unreachable = await readToolResult<{ error?: string; message?: string }>(
      await callMcpTool(adminHeaders, "get_report", { report: "costs" }),
    );
    reportsInternalMock.mockRejectedValueOnce(
      new GoSvcClientError({
        code: "unauthorized",
        message: "missing server call token",
        status: 401,
      }),
    );
    const misconfigured = await readToolResult<{ error?: string; message?: string }>(
      await callMcpTool(adminHeaders, "get_report", { report: "costs" }),
    );
    reportsInternalMock.mockRejectedValueOnce(
      new GoSvcClientError({
        code: "organization_access_denied",
        message: "Organization access denied",
        status: 403,
      }),
    );
    const removed = await readToolResult<{ error?: string }>(
      await callMcpTool(adminHeaders, "get_report", { report: "costs" }),
    );
    reportsInternalMock.mockRejectedValueOnce(
      new GoSvcClientError({
        code: "feature_unavailable",
        message: "Reports is not enabled for this workspace",
        status: 403,
      }),
    );
    const flagLookupFailed = await readToolResult<{ error?: string; message?: string }>(
      await callMcpTool(adminHeaders, "get_report", { report: "costs" }),
    );

    expect(disabled).toMatchObject({
      isError: true,
      output: { error: "feature_unavailable" },
    });
    // Reports are for admins and localization managers; a translator gets none of them.
    expect(refused).toMatchObject({
      isError: true,
      output: { error: "report_forbidden" },
    });
    expect(activity.isError).toBe(false);
    expect(activity.output).toMatchObject({
      kind: "activity",
      stillUpdating: false,
      activity: { current: { arrived: 0 } },
    });
    expect(activity.output.activity?.series?.length).toBeGreaterThan(0);
    expect(words.output).toMatchObject({
      kind: "words",
      wordCounts: { rows: [], groupBy: "task", series: { split: "band", per: "month" } },
    });
    // go-svc is asked as the member, with the validated query and the page's defaults.
    expect(reportsInternalMock.mock.calls.map((call) => call[0])).toEqual([
      "activity",
      "words",
      "ai",
      "time",
      "costs",
      "costs",
      "costs",
      "costs",
    ]);
    expect(reportsInternalMock.mock.calls[0][1]).toMatchObject({
      organizationId: adminAuth.organization.localOrganizationId,
      userId: adminAuth.user.localUserId,
      query: { unit: "strings", step: "translation" },
    });
    expect(reportsInternalMock.mock.calls[0][1].query).not.toHaveProperty("format");
    expect(reportsInternalMock.mock.calls[1][1]).toMatchObject({
      query: { groupBy: "task", split: "band", per: "month", page: 1 },
    });
    expect(invalid).toMatchObject({ isError: true, output: { error: "invalid_report_query" } });
    expect(refusedByGoSvc).toMatchObject({
      isError: true,
      output: { error: "report_forbidden", message: "Reports require billing access" },
    });
    expect(reportsInternalMock.mock.calls[2][1]).toMatchObject({
      query: { groupBy: "model", page: 1 },
    });
    // go-svc's answers about the request pass on; its own failures are ours, said plainly.
    expect(busy).toMatchObject({
      isError: true,
      output: { error: "reports_busy", message: "Reports is busy; try again shortly" },
    });
    expect(removed).toMatchObject({
      isError: true,
      output: { error: "organization_access_denied" },
    });
    // The tool found the flag on; go-svc's "off" is its own lookup failing.
    for (const failed of [unreachable, misconfigured, flagLookupFailed]) {
      expect(failed).toMatchObject({ isError: true, output: { error: "reports_unavailable" } });
      expect(failed.output.message).not.toMatch(/go-svc|token/);
    }
  });
});
