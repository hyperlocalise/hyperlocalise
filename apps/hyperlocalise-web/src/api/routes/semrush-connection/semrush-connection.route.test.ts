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

const mocks = vi.hoisted(() => ({
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
    resolveApiAuthContextFromSession: mocks.resolveApiAuthContextFromSessionMock,
  };
});

import { createApp } from "@/api/app";
import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { createWorkspaceAutomation } from "@/lib/agents/workspace-automations";
import { db, schema } from "@/lib/database";
import { isOk } from "@/lib/primitives/result/results";

const client = testClient(createApp());
const fixture = createAuthTestFixture();

describe("semrushConnectionRoutes", () => {
  beforeAll(async () => {
    await db.$client.query("select 1");
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await fixture.cleanup();
  });

  it("creates lists and deletes a Semrush connection", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const createResponse = await client.api.orgs[":organizationSlug"]["semrush-connections"].$post(
      {
        param: { organizationSlug },
        json: {
          displayName: "Semrush Prod",
          apiKey: "semrush_test_api_key_1234",
          enabled: true,
          validate: false,
        },
      },
      { headers },
    );

    expect(createResponse.status).toBe(201);
    const created = await createResponse.json();
    expect(created).toMatchObject({
      semrushConnection: {
        displayName: "Semrush Prod",
        enabled: true,
      },
    });
    if (!("semrushConnection" in created)) {
      throw new Error("expected semrushConnection in create response");
    }
    expect(created.semrushConnection).not.toHaveProperty("apiKey");
    expect(created.semrushConnection).not.toHaveProperty("ciphertext");
    expect(created.semrushConnection.maskedApiKeySuffix).toContain("1234");

    const listResponse = await client.api.orgs[":organizationSlug"]["semrush-connections"].$get(
      { param: { organizationSlug } },
      { headers },
    );
    expect(listResponse.status).toBe(200);
    const listed = await listResponse.json();
    expect(listed).toMatchObject({
      semrushConnections: expect.arrayContaining([
        expect.objectContaining({ id: created.semrushConnection.id }),
      ]),
    });

    const deleteResponse = await client.api.orgs[":organizationSlug"]["semrush-connections"][
      ":connectionId"
    ].$delete(
      {
        param: {
          organizationSlug,
          connectionId: created.semrushConnection.id,
        },
      },
      { headers },
    );
    expect(deleteResponse.status).toBe(204);
  });

  it("rejects invalid Semrush connection payloads", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const response = await client.api.orgs[":organizationSlug"]["semrush-connections"].$post(
      {
        param: { organizationSlug },
        json: {
          displayName: "",
          apiKey: "",
          enabled: true,
        },
      },
      { headers },
    );

    expect(response.status).toBe(400);
  });

  it("rejects deleting a Semrush connection used by an automation", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";
    const organizationId = globalThis.__testApiAuthContext!.organization.localOrganizationId;
    const userId = globalThis.__testApiAuthContext!.user.localUserId;

    const createResponse = await client.api.orgs[":organizationSlug"]["semrush-connections"].$post(
      {
        param: { organizationSlug },
        json: {
          displayName: "Semrush In Use",
          apiKey: "semrush_test_api_key_9999",
          enabled: true,
          validate: false,
        },
      },
      { headers },
    );
    expect(createResponse.status).toBe(201);
    const created = await createResponse.json();
    if (!("semrushConnection" in created)) {
      throw new Error("expected semrushConnection in create response");
    }

    // Mark valid so automation integration validation accepts it.
    await db
      .update(schema.semrushConnections)
      .set({ validationStatus: "valid", validationMessage: "test" })
      .where(eq(schema.semrushConnections.id, created.semrushConnection.id));

    const automation = await createWorkspaceAutomation({
      organizationId,
      authorUserId: userId,
      name: "Semrush automation",
      instructions: "Use Semrush.",
      toolConfig: {
        semrush: {
          enabled: true,
          connectionId: created.semrushConnection.id,
        },
      },
    });
    expect(isOk(automation)).toBe(true);

    const deleteResponse = await client.api.orgs[":organizationSlug"]["semrush-connections"][
      ":connectionId"
    ].$delete(
      {
        param: {
          organizationSlug,
          connectionId: created.semrushConnection.id,
        },
      },
      { headers },
    );
    expect(deleteResponse.status).toBe(409);
    const body = await deleteResponse.json();
    expect(body).toMatchObject({ error: "semrush_connection_in_use" });
  });
});
