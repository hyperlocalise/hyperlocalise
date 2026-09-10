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
import type { AppType } from "@/api/typed-app";
import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { createWorkspaceAutomation } from "@/lib/agents/workspace-automations";
import { db, schema } from "@/lib/database/client";
import { isOk } from "@/lib/primitives/result/results";

const client = testClient<AppType>(createApp());
const fixture = createAuthTestFixture();

describe("zernioConnectionRoutes", () => {
  beforeAll(async () => {
    await db.$client.query("select 1");
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await fixture.cleanup();
  });

  it("creates lists and deletes a Zernio connection", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const createResponse = await client.api.orgs[":organizationSlug"]["zernio-connections"].$post(
      {
        param: { organizationSlug },
        json: {
          displayName: "Zernio Prod",
          apiKey: "zernio_test_api_key_1234",
          enabled: true,
          validate: false,
        },
      },
      { headers },
    );

    expect(createResponse.status).toBe(201);
    const created = await createResponse.json();
    expect(created).toMatchObject({
      zernioConnection: {
        displayName: "Zernio Prod",
        enabled: true,
      },
    });
    if (!("zernioConnection" in created)) {
      throw new Error("expected zernioConnection in create response");
    }
    expect(created.zernioConnection).not.toHaveProperty("apiKey");
    expect(created.zernioConnection).not.toHaveProperty("ciphertext");
    expect(created.zernioConnection.maskedApiKeySuffix).toContain("1234");

    const listResponse = await client.api.orgs[":organizationSlug"]["zernio-connections"].$get(
      { param: { organizationSlug } },
      { headers },
    );
    expect(listResponse.status).toBe(200);
    const listed = await listResponse.json();
    expect(listed).toMatchObject({
      zernioConnections: expect.arrayContaining([
        expect.objectContaining({ id: created.zernioConnection.id }),
      ]),
    });

    const deleteResponse = await client.api.orgs[":organizationSlug"]["zernio-connections"][
      ":connectionId"
    ].$delete(
      {
        param: {
          organizationSlug,
          connectionId: created.zernioConnection.id,
        },
      },
      { headers },
    );
    expect(deleteResponse.status).toBe(204);
  });

  it("rejects invalid Zernio connection payloads", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const response = await client.api.orgs[":organizationSlug"]["zernio-connections"].$post(
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

  it("rejects deleting a Zernio connection used by an automation", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";
    const organizationId = globalThis.__testApiAuthContext!.organization.localOrganizationId;
    const userId = globalThis.__testApiAuthContext!.user.localUserId;

    const createResponse = await client.api.orgs[":organizationSlug"]["zernio-connections"].$post(
      {
        param: { organizationSlug },
        json: {
          displayName: "Zernio In Use",
          apiKey: "zernio_test_api_key_9999",
          enabled: true,
          validate: false,
        },
      },
      { headers },
    );
    expect(createResponse.status).toBe(201);
    const created = await createResponse.json();
    if (!("zernioConnection" in created)) {
      throw new Error("expected zernioConnection in create response");
    }

    await db
      .update(schema.zernioConnections)
      .set({ validationStatus: "valid", validationMessage: "test" })
      .where(eq(schema.zernioConnections.id, created.zernioConnection.id));

    const automation = await createWorkspaceAutomation({
      organizationId,
      authorUserId: userId,
      name: "Zernio automation",
      instructions: "Create ads.",
      toolConfig: {
        zernio: {
          enabled: true,
          connectionId: created.zernioConnection.id,
        },
      },
    });
    expect(isOk(automation)).toBe(true);

    const deleteResponse = await client.api.orgs[":organizationSlug"]["zernio-connections"][
      ":connectionId"
    ].$delete(
      {
        param: {
          organizationSlug,
          connectionId: created.zernioConnection.id,
        },
      },
      { headers },
    );
    expect(deleteResponse.status).toBe(409);
    const body = await deleteResponse.json();
    expect(body).toMatchObject({ error: "zernio_connection_in_use" });
  });
});
