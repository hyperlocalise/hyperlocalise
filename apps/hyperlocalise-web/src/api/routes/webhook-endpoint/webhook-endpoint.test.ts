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

import { app } from "@/api/app";
import type { WorkosAuthIdentity } from "@/api/auth/workos";
import { createAuthTestFixture } from "@/api/test-auth.fixture";
import type { AppType } from "@/api/typed-app";
import { db, schema } from "@/lib/database/client";

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
  return { ...actual, resolveApiAuthContextFromSession: resolveApiAuthContextFromSessionMock };
});

const client = testClient<AppType>(app);
const fixture = createAuthTestFixture();
const endpoints = client.api.orgs[":organizationSlug"]["webhook-endpoints"];

function param(identity: WorkosAuthIdentity) {
  return { organizationSlug: identity.organization.slug ?? "missing-slug" };
}

async function headers(identity: WorkosAuthIdentity) {
  return { headers: await fixture.authHeadersFor(identity) };
}

describe("webhookEndpointRoutes", () => {
  beforeAll(async () => {
    await db.$client.query("select 1");
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await fixture.cleanup();
  });

  it("creates an endpoint, returns its secret once, and stores it encrypted", async () => {
    const admin = fixture.createWorkosIdentityWithRole("admin");
    const created = await endpoints.$post(
      {
        param: param(admin),
        json: { url: "https://hooks.example.com/in", eventTypes: ["job.status_changed"] },
      },
      await headers(admin),
    );
    expect(created.status).toBe(201);
    const body = (await created.json()) as {
      webhookEndpoint: { id: string; enabled: boolean };
      secret: string;
    };
    expect(body.secret).toMatch(/^whsec_/);
    expect(body.webhookEndpoint).toMatchObject({ enabled: true });

    const [row] = await db
      .select()
      .from(schema.webhookEndpoints)
      .where(eq(schema.webhookEndpoints.id, body.webhookEndpoint.id));
    expect(JSON.stringify(row?.secret)).not.toContain(body.secret.slice(6));

    const listed = await endpoints.$get({ param: param(admin) }, await headers(admin));
    expect(listed.status).toBe(200);
    const list = (await listed.json()) as { webhookEndpoints: Record<string, unknown>[] };
    expect(list.webhookEndpoints).toHaveLength(1);
    expect(list.webhookEndpoints[0]).not.toHaveProperty("secret");

    const deleted = await endpoints[":endpointId"].$delete(
      { param: { ...param(admin), endpointId: body.webhookEndpoint.id } },
      await headers(admin),
    );
    expect(deleted.status).toBe(204);
  });

  it("rejects a project that is not in the workspace", async () => {
    const admin = fixture.createWorkosIdentityWithRole("admin");
    const response = await endpoints.$post(
      {
        param: param(admin),
        json: {
          url: "https://hooks.example.com/in",
          eventTypes: [],
          projectId: "proj_missing",
        },
      },
      await headers(admin),
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "webhook_project_not_found" });
  });

  it("rejects unsafe URLs", async () => {
    const admin = fixture.createWorkosIdentityWithRole("admin");
    const response = await endpoints.$post(
      { param: param(admin), json: { url: "http://10.0.0.1/hook", eventTypes: [] } },
      await headers(admin),
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "webhook_url_invalid" });
  });

  it("forbids roles without API key access", async () => {
    const developer = fixture.createWorkosIdentityWithRole("developer");
    const listed = await endpoints.$get({ param: param(developer) }, await headers(developer));
    expect(listed.status).toBe(403);
    const created = await endpoints.$post(
      { param: param(developer), json: { url: "https://hooks.example.com/in", eventTypes: [] } },
      await headers(developer),
    );
    expect(created.status).toBe(403);
  });

  it("hides another workspace's endpoints", async () => {
    const owner = fixture.createWorkosIdentityWithRole("admin");
    const created = await endpoints.$post(
      { param: param(owner), json: { url: "https://hooks.example.com/in", eventTypes: [] } },
      await headers(owner),
    );
    const { webhookEndpoint } = (await created.json()) as { webhookEndpoint: { id: string } };

    const outsider = fixture.createWorkosIdentityWithRole("admin");
    const patched = await endpoints[":endpointId"].$patch(
      {
        param: { ...param(outsider), endpointId: webhookEndpoint.id },
        json: { enabled: false },
      },
      await headers(outsider),
    );
    expect(patched.status).toBe(404);
    const rotated = await endpoints[":endpointId"]["rotate-secret"].$post(
      { param: { ...param(outsider), endpointId: webhookEndpoint.id } },
      await headers(outsider),
    );
    expect(rotated.status).toBe(404);
  });
});
