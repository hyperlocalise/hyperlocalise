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

describe("gitlabConnectionRoutes", () => {
  beforeAll(async () => {
    await db.$client.query("select 1");
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await fixture.cleanup();
  });

  it("creates lists and deletes a self-hosted GitLab connection", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const createResponse = await client.api.orgs[":organizationSlug"]["gitlab-connections"].$post(
      {
        param: { organizationSlug },
        json: {
          displayName: "GitLab Prod",
          baseUrl: "https://gitlab.acme.example",
          accessToken: "glpat-test-token-1234",
          enabled: true,
          validate: false,
        },
      },
      { headers },
    );

    expect(createResponse.status).toBe(201);
    const created = await createResponse.json();
    expect(created).toMatchObject({
      gitlabConnection: {
        displayName: "GitLab Prod",
        baseUrl: "https://gitlab.acme.example",
        enabled: true,
      },
    });
    if (!("gitlabConnection" in created)) {
      throw new Error("expected gitlabConnection in create response");
    }
    expect(created.gitlabConnection).not.toHaveProperty("accessToken");
    expect(created.gitlabConnection).not.toHaveProperty("ciphertext");
    expect(created.gitlabConnection.maskedAccessTokenSuffix).toContain("1234");

    const listResponse = await client.api.orgs[":organizationSlug"]["gitlab-connections"].$get(
      { param: { organizationSlug } },
      { headers },
    );
    expect(listResponse.status).toBe(200);
    const listed = await listResponse.json();
    expect(listed).toMatchObject({
      gitlabConnections: expect.arrayContaining([
        expect.objectContaining({ id: created.gitlabConnection.id }),
      ]),
    });

    const deleteResponse = await client.api.orgs[":organizationSlug"]["gitlab-connections"][
      ":connectionId"
    ].$delete(
      {
        param: {
          organizationSlug,
          connectionId: created.gitlabConnection.id,
        },
      },
      { headers },
    );
    expect(deleteResponse.status).toBe(204);
  });

  it("rejects gitlab.com as a self-hosted connection", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const response = await client.api.orgs[":organizationSlug"]["gitlab-connections"].$post(
      {
        param: { organizationSlug },
        json: {
          displayName: "GitLab.com",
          baseUrl: "https://gitlab.com",
          accessToken: "glpat-test-token",
          enabled: true,
          validate: false,
        },
      },
      { headers },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "gitlab_com_uses_pipes",
    });
  });

  it("rejects deleting a GitLab connection used by an automation", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";
    const organizationId = globalThis.__testApiAuthContext!.organization.localOrganizationId;
    const userId = globalThis.__testApiAuthContext!.user.localUserId;

    const createResponse = await client.api.orgs[":organizationSlug"]["gitlab-connections"].$post(
      {
        param: { organizationSlug },
        json: {
          displayName: "GitLab In Use",
          baseUrl: "https://gitlab.in-use.example",
          accessToken: "glpat-test-token-9999",
          enabled: true,
          validate: false,
        },
      },
      { headers },
    );
    expect(createResponse.status).toBe(201);
    const created = await createResponse.json();
    if (!("gitlabConnection" in created)) {
      throw new Error("expected gitlabConnection in create response");
    }

    await db
      .update(schema.gitlabConnections)
      .set({ validationStatus: "valid", validationMessage: "test" })
      .where(eq(schema.gitlabConnections.id, created.gitlabConnection.id));

    const automation = await createWorkspaceAutomation({
      organizationId,
      authorUserId: userId,
      name: "GitLab automation",
      instructions: "Review the repo.",
      repositoryTarget: {
        kind: "gitlab",
        gitlabPathWithNamespace: "acme/web",
        gitlabConnectionId: created.gitlabConnection.id,
      },
      toolConfig: {
        gitlab: {
          enabled: true,
          connectionId: created.gitlabConnection.id,
        },
      },
    });
    expect(isOk(automation)).toBe(true);

    const deleteResponse = await client.api.orgs[":organizationSlug"]["gitlab-connections"][
      ":connectionId"
    ].$delete(
      {
        param: {
          organizationSlug,
          connectionId: created.gitlabConnection.id,
        },
      },
      { headers },
    );
    expect(deleteResponse.status).toBe(409);
    const body = await deleteResponse.json();
    expect(body).toMatchObject({ error: "gitlab_connection_in_use" });
  });
});
