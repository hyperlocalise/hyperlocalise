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

import { beforeAll, describe, expect, it } from "vite-plus/test";

import { createApp } from "@/api/app";
import { env } from "@/lib/env";
import {
  GO_SVC_SERVICE_TOKEN_HEADER,
  mintGoSvcServiceToken,
} from "@/lib/go-svc/go-svc-service-token";

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

async function postAction(action: string, payload: Record<string, unknown>, headers = serviceHeaders()) {
  return app.request("/api/internal/iris/automation-action", {
    method: "POST",
    headers,
    body: JSON.stringify({ action, payload }),
  });
}

describe("internal iris automation-action route", () => {
  beforeAll(async () => {
    await import("@/lib/database/client").then(({ db }) => db.$client.query("select 1"));
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
});
