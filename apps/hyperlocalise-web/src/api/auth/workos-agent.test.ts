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

import { generateKeyPairSync } from "node:crypto";

import { eq } from "drizzle-orm";
import jwt from "jsonwebtoken";
import { testClient } from "hono/testing";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { ensureAiFeaturesAllowedMock, enqueueJobCreatedActivityMock } = vi.hoisted(() => ({
  ensureAiFeaturesAllowedMock: vi.fn(),
  enqueueJobCreatedActivityMock: vi.fn(),
}));

vi.mock("@/lib/billing/ai-features", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/billing/ai-features")>();
  return {
    ...actual,
    ensureAiFeaturesAllowed: ensureAiFeaturesAllowedMock,
  };
});

vi.mock("@/lib/activity-log/job-automation-events", () => ({
  enqueueJobCreatedActivity: enqueueJobCreatedActivityMock,
  enqueueJobFailedActivity: vi.fn(),
}));

const { reconcileWorkosMembershipsForUserMock } = vi.hoisted(() => ({
  reconcileWorkosMembershipsForUserMock: vi.fn(),
}));

vi.mock("@/api/auth/workos-membership-reconcile", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/auth/workos-membership-reconcile")>();

  return {
    ...actual,
    reconcileWorkosMembershipsForUser: reconcileWorkosMembershipsForUserMock,
  };
});

import { createApp } from "@/api/app";
import type { AppType } from "@/api/typed-app";
import { createMcpTestApp } from "@/api/routes/mcp/mcp.fixture";
import {
  cleanupPublicApiFixture,
  createPublicApiFixture,
} from "@/api/routes/public-jobs/public-jobs.fixture";
import { db, schema } from "@/lib/database/client";
import { env } from "@/lib/env";
import { ok } from "@/lib/primitives/result/results";
import type { TranslationJobEventData } from "@/lib/workflow/types";
import { setAgentAccessTokenPublicKeyResolverForTest } from "@/lib/workos/agent-access-token";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });

const enqueueJob = vi.fn(async (event: TranslationJobEventData) => ({
  ids: [event.jobId],
}));

const client = testClient<AppType>(
  createApp({
    jobQueue: {
      enqueue: enqueueJob,
    },
  }),
);

const mcpApp = createMcpTestApp();

function signAgentToken(claims: Record<string, unknown>) {
  return jwt.sign(claims, privateKey, {
    algorithm: "RS256",
    expiresIn: "5m",
    keyid: "test-kid",
  });
}

async function claimedAgentToken(input: {
  organizationId: string;
  workosUserId: string;
  scope: string;
  registrationId: string;
}) {
  const [organization] = await db
    .select({ workosOrganizationId: schema.organizations.workosOrganizationId })
    .from(schema.organizations)
    .where(eq(schema.organizations.id, input.organizationId))
    .limit(1);

  if (!organization) {
    throw new Error("organization not found");
  }

  return signAgentToken({
    iss: "https://authkit.test",
    aud: env.WORKOS_CLIENT_ID,
    sub: input.registrationId,
    org_id: organization.workosOrganizationId,
    scope: input.scope,
    act: { sub: input.workosUserId },
  });
}

beforeAll(async () => {
  await db.$client.query("select 1");
});

beforeEach(() => {
  reconcileWorkosMembershipsForUserMock.mockResolvedValue({ status: "skipped" });
  ensureAiFeaturesAllowedMock.mockResolvedValue(ok(undefined));
  setAgentAccessTokenPublicKeyResolverForTest(async () =>
    publicKey.export({ type: "spki", format: "pem" }).toString(),
  );
});

afterEach(async () => {
  reconcileWorkosMembershipsForUserMock.mockClear();
  enqueueJob.mockClear();
  setAgentAccessTokenPublicKeyResolverForTest(null);
  await cleanupPublicApiFixture();
});

describe("WorkOS agent JWT on /api/v1", () => {
  it("accepts a claimed agent JWT and still accepts PATs", async () => {
    const { apiKey, project, user } = await createPublicApiFixture({
      permissions: ["jobs:read", "jobs:write"],
    });

    const claimedToken = await claimedAgentToken({
      organizationId: project.organizationId,
      workosUserId: user.workosUserId,
      scope: "jobs:read jobs:write",
      registrationId: "agent_reg_01API",
    });

    const jwtResponse = await client.api.v1.jobs.$post(
      {
        json: {
          type: "string",
          projectId: project.id,
          stringInput: {
            sourceText: "Hello",
            sourceLocale: "en-US",
            targetLocales: ["fr-FR"],
          },
        },
      },
      { headers: { Authorization: `Bearer ${claimedToken}` } },
    );

    expect(jwtResponse.status).toBe(201);

    const patResponse = await client.api.v1.jobs.$post(
      {
        json: {
          type: "string",
          projectId: project.id,
          stringInput: {
            sourceText: "Hello",
            sourceLocale: "en-US",
            targetLocales: ["fr-FR"],
          },
        },
      },
      { headers: { "x-api-key": apiKey } },
    );

    expect(patResponse.status).toBe(201);
  });

  it("challenges missing credentials with public API resource metadata", async () => {
    const response = await client.api.v1.jobs.$post({
      json: {
        type: "string",
        projectId: "project_missing",
        stringInput: {
          sourceText: "Hello",
          sourceLocale: "en-US",
          targetLocales: ["fr-FR"],
        },
      },
    });

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain(
      "/.well-known/oauth-protected-resource/api/v1",
    );
  });

  it("fails closed when the claimed membership is gone", async () => {
    const { project, user } = await createPublicApiFixture();

    await db
      .delete(schema.organizationMemberships)
      .where(eq(schema.organizationMemberships.userId, user.id));

    const claimedToken = await claimedAgentToken({
      organizationId: project.organizationId,
      workosUserId: user.workosUserId,
      scope: "jobs:write",
      registrationId: "agent_reg_01GONE",
    });

    const response = await client.api.v1.jobs.$post(
      {
        json: {
          type: "string",
          projectId: project.id,
          stringInput: {
            sourceText: "Hello",
            sourceLocale: "en-US",
            targetLocales: ["fr-FR"],
          },
        },
      },
      { headers: { Authorization: `Bearer ${claimedToken}` } },
    );

    expect(response.status).toBe(403);
  });
});

describe("WorkOS agent JWT on MCP", () => {
  it("authorizes MCP when the token includes the mcp scope", async () => {
    const { project, user } = await createPublicApiFixture();
    const claimedToken = await claimedAgentToken({
      organizationId: project.organizationId,
      workosUserId: user.workosUserId,
      scope: "mcp jobs:read",
      registrationId: "agent_reg_01MCP",
    });

    const response = await mcpApp.request("http://localhost/mcp", {
      headers: {
        authorization: `Bearer ${claimedToken}`,
      },
    });

    expect(response.status).not.toBe(401);
    expect(response.status).not.toBe(403);
  });

  it("keeps the MCP resource_metadata challenge for opaque tokens", async () => {
    const response = await mcpApp.request("http://localhost/mcp", {
      headers: {
        authorization: "Bearer hl_mcp_not_a_session",
      },
    });

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe(
      'Bearer resource_metadata="http://localhost/.well-known/oauth-protected-resource", scope="mcp"',
    );
  });

  it("rejects claimed JWTs that omit the mcp scope", async () => {
    const { project, user } = await createPublicApiFixture();
    const claimedToken = await claimedAgentToken({
      organizationId: project.organizationId,
      workosUserId: user.workosUserId,
      scope: "jobs:read",
      registrationId: "agent_reg_01NOMCP",
    });

    const response = await mcpApp.request("http://localhost/mcp", {
      headers: {
        authorization: `Bearer ${claimedToken}`,
      },
    });

    expect(response.status).toBe(403);
  });
});
