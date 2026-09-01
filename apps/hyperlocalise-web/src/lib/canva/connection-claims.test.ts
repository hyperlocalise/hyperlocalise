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
import { createApiKeyTestFixture } from "@/api/routes/api-key/api-key.fixture";
import { createProjectTestFixture } from "@/api/routes/project/project.fixture";
import { db } from "@/lib/database/client";

import {
  completeCanvaConnectionClaim,
  createCanvaConnectionClaim,
  pollCanvaConnectionClaim,
} from "./connection-claims";
import { createCanvaConnection, getCanvaConnectionByToken } from "./connections";

const client = testClient<AppType>(createApp());
const apiKeyFixture = createApiKeyTestFixture(client);
const projectFixture = createProjectTestFixture(client);

describe("completeCanvaConnectionClaim", () => {
  beforeAll(async () => {
    await db.$client.query("select 1");
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await apiKeyFixture.cleanup();
    await projectFixture.cleanup();
  });

  it("keeps the sealed claim token aligned when complete-claim races", async () => {
    const identity = apiKeyFixture.createWorkosIdentityWithRole("admin");
    await apiKeyFixture.authHeadersFor(identity);
    const auth = globalThis.__testApiAuthContext;
    if (!auth) {
      throw new Error("expected test auth context");
    }

    const apiKeyResponse = await apiKeyFixture.createApiKeyViaApi(identity, {
      name: "Canva claim race key",
    });
    const apiKeyBody = (await apiKeyResponse.json()) as { apiKey: { id: string } };
    const projectResponse = await projectFixture.createProjectViaApi(identity);
    const projectBody = (await projectResponse.json()) as { project: { id: string } };

    const created = await createCanvaConnection({
      organizationId: auth.organization.localOrganizationId,
      userId: auth.user.localUserId,
      displayName: "Race Canva",
      apiKeyId: apiKeyBody.apiKey.id,
      projectId: projectBody.project.id,
      sourceLocale: "en",
      targetLocales: ["es"],
    });
    const claim = await createCanvaConnectionClaim();

    const results = await Promise.allSettled([
      completeCanvaConnectionClaim({
        organizationId: auth.organization.localOrganizationId,
        userId: auth.user.localUserId,
        connectionId: created.connection.id,
        claimId: claim.claimId,
      }),
      completeCanvaConnectionClaim({
        organizationId: auth.organization.localOrganizationId,
        userId: auth.user.localUserId,
        connectionId: created.connection.id,
        claimId: claim.claimId,
      }),
    ]);

    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
      message: "canva_claim_already_completed",
    });

    const polled = await pollCanvaConnectionClaim({
      claimId: claim.claimId,
      pollToken: claim.pollToken,
    });
    expect(polled).toMatchObject({ status: "authorized" });
    if (polled.status !== "authorized") {
      throw new Error("expected authorized claim poll");
    }

    const connection = await getCanvaConnectionByToken(polled.connectionToken);
    expect(connection?.id).toBe(created.connection.id);
  });
});
