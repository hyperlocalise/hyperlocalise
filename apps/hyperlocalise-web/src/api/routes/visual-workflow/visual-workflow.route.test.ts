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

import { eq } from "drizzle-orm";
import { testClient } from "hono/testing";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

const {
  resolveApiAuthContextFromSessionMock,
  visualWorkflowExecutionEnqueueMock,
  workspaceVisualWorkflowsFlagRunMock,
} = vi.hoisted(() => ({
  resolveApiAuthContextFromSessionMock: vi.fn(
    (options) =>
      globalThis.__resolveTestApiAuthContextFromSession?.(options) ??
      globalThis.__testApiAuthContext ??
      null,
  ),
  visualWorkflowExecutionEnqueueMock: vi.fn(async () => ({ ids: ["visual-workflow-run-1"] })),
  workspaceVisualWorkflowsFlagRunMock: vi.fn(async () => true),
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
    workspaceVisualWorkflowsFlag: {
      run: workspaceVisualWorkflowsFlagRunMock,
    },
  };
});

vi.mock("@/workflows/adapters", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/workflows/adapters")>();
  return {
    ...actual,
    createVisualWorkflowExecutionQueue: vi.fn(() => ({
      enqueue: visualWorkflowExecutionEnqueueMock,
    })),
  };
});

import { createApp } from "@/api/app";
import type { AppType } from "@/api/typed-app";
import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { db, schema } from "@/lib/database/client";
import { buildVisualWorkflowManualIdempotencyKey } from "@/lib/visual-workflows/dispatch/idempotency";

const client = testClient<AppType>(createApp());
const fixture = createAuthTestFixture();

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  vi.clearAllMocks();
  workspaceVisualWorkflowsFlagRunMock.mockResolvedValue(true);
  await fixture.cleanup();
});

async function getOrganizationId(workosOrganizationId: string) {
  const [organization] = await db
    .select({ id: schema.organizations.id })
    .from(schema.organizations)
    .where(eq(schema.organizations.workosOrganizationId, workosOrganizationId))
    .limit(1);

  if (!organization) {
    throw new Error("expected test organization");
  }

  return organization.id;
}

describe("visual workflow routes", () => {
  it("creates, reads, updates, and lists visual workflows for an operator", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";
    const organizationId = await getOrganizationId(identity.organization.workosOrganizationId);

    const createdResponse = await client.api.orgs[":organizationSlug"]["visual-workflows"].$post(
      {
        param: { organizationSlug },
        json: { name: "Lead ping" },
      },
      { headers },
    );

    expect(createdResponse.status).toBe(201);
    const created = (await createdResponse.json()) as {
      visualWorkflow: { id: string; name: string; status: string };
    };
    expect(created.visualWorkflow.name).toBe("Lead ping");
    expect(created.visualWorkflow.status).toBe("draft");

    const listedResponse = await client.api.orgs[":organizationSlug"]["visual-workflows"].$get(
      {
        param: { organizationSlug },
        query: { limit: "50", offset: "0" },
      },
      { headers },
    );
    expect(listedResponse.status).toBe(200);
    const listed = (await listedResponse.json()) as {
      visualWorkflows: Array<{ id: string }>;
    };
    expect(listed.visualWorkflows.some((row) => row.id === created.visualWorkflow.id)).toBe(true);

    const readResponse = await client.api.orgs[":organizationSlug"]["visual-workflows"][
      ":visualWorkflowId"
    ].$get(
      {
        param: {
          organizationSlug,
          visualWorkflowId: created.visualWorkflow.id,
        },
      },
      { headers },
    );
    expect(readResponse.status).toBe(200);

    const updatedResponse = await client.api.orgs[":organizationSlug"]["visual-workflows"][
      ":visualWorkflowId"
    ].$patch(
      {
        param: {
          organizationSlug,
          visualWorkflowId: created.visualWorkflow.id,
        },
        json: { name: "Lead ping v2" },
      },
      { headers },
    );
    expect(updatedResponse.status).toBe(200);
    const updated = (await updatedResponse.json()) as {
      visualWorkflow: { name: string };
    };
    expect(updated.visualWorkflow.name).toBe("Lead ping v2");

    const deletedResponse = await client.api.orgs[":organizationSlug"]["visual-workflows"][
      ":visualWorkflowId"
    ].$delete(
      {
        param: {
          organizationSlug,
          visualWorkflowId: created.visualWorkflow.id,
        },
      },
      { headers },
    );
    expect(deletedResponse.status).toBe(204);

    const listedAfterDelete = await client.api.orgs[":organizationSlug"]["visual-workflows"].$get(
      {
        param: { organizationSlug },
        query: { limit: "50", offset: "0" },
      },
      { headers },
    );
    expect(listedAfterDelete.status).toBe(200);
    const listedAfter = (await listedAfterDelete.json()) as {
      visualWorkflows: Array<{ id: string }>;
    };
    expect(listedAfter.visualWorkflows.some((row) => row.id === created.visualWorkflow.id)).toBe(
      false,
    );

    const rows = await db
      .select()
      .from(schema.visualWorkflows)
      .where(eq(schema.visualWorkflows.organizationId, organizationId));
    const deletedRow = rows.find((row) => row.id === created.visualWorkflow.id);
    expect(deletedRow?.status).toBe("archived");
  });

  it("returns not found when deleting a missing visual workflow", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const response = await client.api.orgs[":organizationSlug"]["visual-workflows"][
      ":visualWorkflowId"
    ].$delete(
      {
        param: {
          organizationSlug,
          visualWorkflowId: crypto.randomUUID(),
        },
      },
      { headers },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: "visual_workflow_not_found",
    });
  });

  it("returns forbidden when the visual workflows feature flag is disabled", async () => {
    workspaceVisualWorkflowsFlagRunMock.mockResolvedValue(false);
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const response = await client.api.orgs[":organizationSlug"]["visual-workflows"].$get(
      {
        param: { organizationSlug },
        query: { limit: "50", offset: "0" },
      },
      { headers },
    );

    expect(response.status).toBe(403);
  });

  it("dispatches idempotent manual runs and returns run listings", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const createdResponse = await client.api.orgs[":organizationSlug"]["visual-workflows"].$post(
      {
        param: { organizationSlug },
        json: { name: "Manual run workflow" },
      },
      { headers },
    );
    expect(createdResponse.status).toBe(201);
    const created = (await createdResponse.json()) as {
      visualWorkflow: { id: string; definitionVersion: number };
    };

    const runPayload = {
      idempotencyKey: `manual:${created.visualWorkflow.id}:coverage`,
      inputSnapshot: { reason: "operator_test" },
    };
    const expectedIdempotencyKey = buildVisualWorkflowManualIdempotencyKey({
      visualWorkflowId: created.visualWorkflow.id,
      definitionVersion: created.visualWorkflow.definitionVersion,
      idempotencyKey: runPayload.idempotencyKey,
    });

    const firstRunResponse = await client.api.orgs[":organizationSlug"]["visual-workflows"][
      ":visualWorkflowId"
    ].runs.$post(
      {
        param: {
          organizationSlug,
          visualWorkflowId: created.visualWorkflow.id,
        },
        json: runPayload,
      },
      { headers },
    );
    expect(firstRunResponse.status).toBe(202);
    const firstRun = (await firstRunResponse.json()) as {
      run: { id: string; status: string; idempotencyKey: string };
      dispatch: { runId: string; enqueued: boolean };
    };
    expect(firstRun.dispatch).toEqual({
      runId: firstRun.run.id,
      enqueued: true,
    });
    expect(firstRun.run).toMatchObject({
      status: "queued",
      idempotencyKey: expectedIdempotencyKey,
    });
    expect(visualWorkflowExecutionEnqueueMock).toHaveBeenCalledWith({
      visualWorkflowRunId: firstRun.run.id,
      visualWorkflowId: created.visualWorkflow.id,
      organizationId: expect.any(String),
    });

    const secondRunResponse = await client.api.orgs[":organizationSlug"]["visual-workflows"][
      ":visualWorkflowId"
    ].runs.$post(
      {
        param: {
          organizationSlug,
          visualWorkflowId: created.visualWorkflow.id,
        },
        json: runPayload,
      },
      { headers },
    );
    expect(secondRunResponse.status).toBe(202);
    const secondRun = (await secondRunResponse.json()) as {
      run: { id: string };
      dispatch: { runId: string; enqueued: boolean };
    };
    expect(secondRun.run.id).toBe(firstRun.run.id);
    expect(secondRun.dispatch).toEqual({
      runId: firstRun.run.id,
      enqueued: false,
    });
    expect(visualWorkflowExecutionEnqueueMock).toHaveBeenCalledTimes(1);

    const listedResponse = await client.api.orgs[":organizationSlug"]["visual-workflows"][
      ":visualWorkflowId"
    ].runs.$get(
      {
        param: {
          organizationSlug,
          visualWorkflowId: created.visualWorkflow.id,
        },
        query: { limit: "20", offset: "0" },
      },
      { headers },
    );
    expect(listedResponse.status).toBe(200);
    const listed = (await listedResponse.json()) as { runs: Array<{ id: string }> };
    expect(listed.runs.map((run) => run.id)).toEqual([firstRun.run.id]);

    const readResponse = await client.api.orgs[":organizationSlug"]["visual-workflows"][
      ":visualWorkflowId"
    ].runs[":runId"].$get(
      {
        param: {
          organizationSlug,
          visualWorkflowId: created.visualWorkflow.id,
          runId: firstRun.run.id,
        },
      },
      { headers },
    );
    expect(readResponse.status).toBe(200);
    const read = (await readResponse.json()) as {
      run: { id: string; nodeRuns?: Array<{ nodeId: string }> };
    };
    expect(read.run.id).toBe(firstRun.run.id);
    expect(Array.isArray(read.run.nodeRuns)).toBe(true);
  });

  it("validates run payloads and returns not found for missing workflows", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";
    const missingWorkflowId = crypto.randomUUID();

    const createdResponse = await client.api.orgs[":organizationSlug"]["visual-workflows"].$post(
      {
        param: { organizationSlug },
        json: { name: "Validation workflow" },
      },
      { headers },
    );
    const created = (await createdResponse.json()) as { visualWorkflow: { id: string } };

    const invalidPayloadResponse = await client.api.orgs[":organizationSlug"]["visual-workflows"][
      ":visualWorkflowId"
    ].runs.$post(
      {
        param: {
          organizationSlug,
          visualWorkflowId: created.visualWorkflow.id,
        },
        json: { idempotencyKey: "" },
      },
      { headers },
    );
    expect(invalidPayloadResponse.status).toBe(400);
    await expect(invalidPayloadResponse.json()).resolves.toMatchObject({
      error: "invalid_visual_workflow_run_payload",
    });

    const missingWorkflowResponse = await client.api.orgs[":organizationSlug"]["visual-workflows"][
      ":visualWorkflowId"
    ].runs.$post(
      {
        param: {
          organizationSlug,
          visualWorkflowId: missingWorkflowId,
        },
        json: { idempotencyKey: "missing-workflow-run" },
      },
      { headers },
    );
    expect(missingWorkflowResponse.status).toBe(404);
    await expect(missingWorkflowResponse.json()).resolves.toMatchObject({
      error: "visual_workflow_not_found",
    });

    const missingRunResponse = await client.api.orgs[":organizationSlug"]["visual-workflows"][
      ":visualWorkflowId"
    ].runs[":runId"].$get(
      {
        param: {
          organizationSlug,
          visualWorkflowId: created.visualWorkflow.id,
          runId: crypto.randomUUID(),
        },
      },
      { headers },
    );
    expect(missingRunResponse.status).toBe(404);
    await expect(missingRunResponse.json()).resolves.toMatchObject({
      error: "visual_workflow_run_not_found",
    });
  });
});
