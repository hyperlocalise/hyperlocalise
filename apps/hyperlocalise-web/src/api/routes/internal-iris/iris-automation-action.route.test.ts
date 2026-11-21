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

import { afterEach, beforeAll, describe, expect, it } from "vite-plus/test";

import { createApp } from "@/api/app";
import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { db, schema } from "@/lib/database/client";
import { env } from "@/lib/env";
import {
  GO_SVC_SERVICE_TOKEN_HEADER,
  mintGoSvcServiceToken,
} from "@/lib/go-svc/go-svc-service-token";
import { parseVisualWorkflowV3Definition } from "@/lib/visual-workflows/schema/definition-migration";
import { createEmptyVisualWorkflowDefinition } from "@/lib/visual-workflows/schema/serializers";

function serviceHeaders() {
  const password = env.WORKOS_COOKIE_PASSWORD;
  if (!password) {
    throw new Error("WORKOS_COOKIE_PASSWORD is required for internal iris route tests");
  }
  return {
    "content-type": "application/json",
    [GO_SVC_SERVICE_TOKEN_HEADER]: mintGoSvcServiceToken(password),
  };
}

const app = createApp();
const fixture = createAuthTestFixture();

const emptyVisualWorkflowDefinition = parseVisualWorkflowV3Definition(
  createEmptyVisualWorkflowDefinition("Iris flow"),
);

async function seedWorkspace(status: "active" | "archived" = "active") {
  const created = await fixture.createLocalWorkosIdentity();
  const [automation] = await db
    .insert(schema.workspaceAutomations)
    .values({
      organizationId: created.organization.id,
      authorUserId: created.user.id,
      status,
      name: status === "archived" ? "Archived bot" : "Iris bot",
      instructions: "Run localisation.",
      triggerConfig: { mode: "manual" },
    })
    .returning({ id: schema.workspaceAutomations.id });
  return { ...created, automationId: automation!.id };
}

async function seedVisualWorkflow(
  input: {
    status?: "draft" | "archived";
    revision?: number;
    published?: boolean;
  } = {},
) {
  const created = await fixture.createLocalWorkosIdentity();
  const [workflow] = await db
    .insert(schema.visualWorkflows)
    .values({
      organizationId: created.organization.id,
      authorUserId: created.user.id,
      status: input.status ?? "draft",
      name: "Iris flow",
      revision: input.revision ?? 1,
      definition: emptyVisualWorkflowDefinition,
      publishedDefinition: input.published ? emptyVisualWorkflowDefinition : null,
      publishedVersion: input.published ? 1 : null,
    })
    .returning({ id: schema.visualWorkflows.id });
  return { ...created, visualWorkflowId: workflow!.id };
}

async function postAction(
  action: string,
  payload: Record<string, unknown>,
  headers = serviceHeaders(),
) {
  return app.request("/api/internal/iris/automation-action", {
    method: "POST",
    headers,
    body: JSON.stringify({ action, payload }),
  });
}

describe("internal iris automation-action route", () => {
  beforeAll(async () => {
    await db.$client.query("select 1");
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  it("rejects requests without the go-svc service token", async () => {
    const response = await app.request("/api/internal/iris/automation-action", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "run_workspace_automation", payload: {} }),
    });
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: "unauthorized" });
  });

  it("rejects a missing action or payload", async () => {
    const response = await app.request("/api/internal/iris/automation-action", {
      method: "POST",
      headers: serviceHeaders(),
      body: JSON.stringify({ action: "run_workspace_automation" }),
    });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "invalid_request_body",
      message: "Invalid automation action",
    });
  });

  it("rejects unknown actions and incomplete identity", async () => {
    const unknown = await postAction("explode", {
      organizationId: randomUUID(),
      userId: randomUUID(),
    });
    expect(unknown.status).toBe(400);
    await expect(unknown.json()).resolves.toMatchObject({ error: "unknown_automation_action" });

    const missing = await postAction("run_workspace_automation", { organizationId: randomUUID() });
    expect(missing.status).toBe(400);
    await expect(missing.json()).resolves.toMatchObject({
      error: "invalid_request_body",
      message: "organization and user are required",
    });
  });

  it("returns not found for a missing automation or visual workflow", async () => {
    const organizationId = randomUUID();
    const userId = randomUUID();
    const run = await postAction("run_workspace_automation", {
      organizationId,
      userId,
      automationId: randomUUID(),
      idempotencyKey: "run-1",
    });
    expect(run.status).toBe(404);
    await expect(run.json()).resolves.toMatchObject({ error: "workspace_automation_not_found" });

    const publish = await postAction("publish_visual_workflow", {
      organizationId,
      userId,
      visualWorkflowId: randomUUID(),
      expectedRevision: 1,
    });
    expect(publish.status).toBe(404);
    await expect(publish.json()).resolves.toMatchObject({ error: "visual_workflow_not_found" });
  });

  it("rejects an archived or foreign-org workspace automation run", async () => {
    const archived = await seedWorkspace("archived");
    const other = await fixture.createLocalWorkosIdentity();
    const invalid = await postAction("run_workspace_automation", {
      organizationId: archived.organization.id,
      userId: archived.user.id,
      automationId: archived.automationId,
    });
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toMatchObject({
      error: "invalid_workspace_automation_run",
    });

    const run = await postAction("run_workspace_automation", {
      organizationId: archived.organization.id,
      userId: archived.user.id,
      automationId: archived.automationId,
      idempotencyKey: "run-archived",
    });
    expect(run.status).toBe(400);
    await expect(run.json()).resolves.toMatchObject({ error: "workspace_automation_archived" });

    const foreign = await postAction("run_workspace_automation", {
      organizationId: other.organization.id,
      userId: other.user.id,
      automationId: archived.automationId,
      idempotencyKey: "run-foreign",
    });
    expect(foreign.status).toBe(404);
    await expect(foreign.json()).resolves.toMatchObject({
      error: "workspace_automation_not_found",
    });
  });

  it("rejects unpublished, archived, and stale visual workflow actions", async () => {
    const draft = await seedVisualWorkflow();
    const archived = await seedVisualWorkflow({ status: "archived" });
    const stale = await seedVisualWorkflow({ revision: 2 });

    const invalidPublish = await postAction("publish_visual_workflow", {
      organizationId: draft.organization.id,
      userId: draft.user.id,
      visualWorkflowId: draft.visualWorkflowId,
      expectedRevision: 0,
    });
    expect(invalidPublish.status).toBe(400);
    await expect(invalidPublish.json()).resolves.toMatchObject({
      error: "invalid_publish_payload",
    });

    const conflict = await postAction("publish_visual_workflow", {
      organizationId: stale.organization.id,
      userId: stale.user.id,
      visualWorkflowId: stale.visualWorkflowId,
      expectedRevision: 1,
    });
    expect(conflict.status).toBe(409);
    await expect(conflict.json()).resolves.toMatchObject({ error: "version_conflict" });

    const unpublished = await postAction("run_visual_workflow", {
      organizationId: draft.organization.id,
      userId: draft.user.id,
      visualWorkflowId: draft.visualWorkflowId,
      idempotencyKey: "live-1",
    });
    expect(unpublished.status).toBe(400);
    await expect(unpublished.json()).resolves.toMatchObject({ error: "workflow_not_published" });

    const invalidRun = await postAction("run_visual_workflow", {
      organizationId: draft.organization.id,
      userId: draft.user.id,
      visualWorkflowId: draft.visualWorkflowId,
    });
    expect(invalidRun.status).toBe(400);
    await expect(invalidRun.json()).resolves.toMatchObject({
      error: "invalid_visual_workflow_run",
    });

    const invalidTest = await postAction("test_visual_workflow", {
      organizationId: draft.organization.id,
      userId: draft.user.id,
      visualWorkflowId: draft.visualWorkflowId,
      idempotencyKey: "test-1",
    });
    expect(invalidTest.status).toBe(400);
    await expect(invalidTest.json()).resolves.toMatchObject({ error: "invalid_test_payload" });

    const archivedTest = await postAction("test_visual_workflow", {
      organizationId: archived.organization.id,
      userId: archived.user.id,
      visualWorkflowId: archived.visualWorkflowId,
      idempotencyKey: "test-archived",
      definition: emptyVisualWorkflowDefinition,
      mode: "mock",
    });
    expect(archivedTest.status).toBe(404);
    await expect(archivedTest.json()).resolves.toMatchObject({
      error: "visual_workflow_not_found",
    });

    const archivedRun = await postAction("run_visual_workflow", {
      organizationId: archived.organization.id,
      userId: archived.user.id,
      visualWorkflowId: archived.visualWorkflowId,
      idempotencyKey: "live-archived",
    });
    expect(archivedRun.status).toBe(404);
    await expect(archivedRun.json()).resolves.toMatchObject({
      error: "visual_workflow_not_found",
    });
  });
});
