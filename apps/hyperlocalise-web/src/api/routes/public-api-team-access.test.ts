import "dotenv/config";

import { randomUUID } from "node:crypto";

import { testClient } from "hono/testing";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

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
  return {
    ...actual,
    resolveApiAuthContextFromSession: resolveApiAuthContextFromSessionMock,
  };
});

import { createApp } from "@/api/app";
import { createMemoryFileStorageAdapter } from "@/api/routes/file/file.fixture";
import {
  cleanupPublicApiFixture,
  hashApiKey,
  insertStoredSourceFile,
} from "@/api/routes/public-jobs/public-jobs.fixture";
import { createProjectTestFixture } from "@/api/routes/project/project.fixture";
import type { ProjectResponse } from "@/api/routes/project/project.schema";
import { createTeamTestFixture } from "@/api/routes/team/team.fixture";
import type { TeamResponse } from "@/api/routes/team/team.schema";
import { db, schema } from "@/lib/database";

const fileStorageAdapter = createMemoryFileStorageAdapter();
const client = testClient(createApp({ fileStorageAdapter }));
const projectFixture = createProjectTestFixture(client);
const teamFixture = createTeamTestFixture(client);
const {
  authHeadersFor,
  createWorkosIdentityWithRole,
  createWorkosIdentityForOrganization,
  getLocalUserId,
  cleanup,
} = projectFixture;

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  vi.clearAllMocks();
  await cleanup();
  await cleanupPublicApiFixture();
});

async function insertTeamScopedApiKey(input: {
  organizationId: string;
  createdByUserId: string;
  permissions?: string[];
}) {
  const suffix = randomUUID();
  const apiKey = `hl_${suffix.replaceAll("-", "")}`;

  await db.insert(schema.organizationApiKeys).values({
    organizationId: input.organizationId,
    name: "Team Scoped Public API Key",
    keyHash: hashApiKey(apiKey),
    keyPrefix: apiKey.slice(0, 8),
    permissions: input.permissions ?? ["jobs:read", "jobs:write", "files:read", "files:write"],
    createdByUserId: input.createdByUserId,
  });

  return apiKey;
}

describe("public API team-scoped access", () => {
  it("denies cross-team file downloads for API keys bound to a team member", async () => {
    const admin = createWorkosIdentityWithRole("admin");
    const member = createWorkosIdentityForOrganization(admin.organization, "member");

    await authHeadersFor(admin);
    await authHeadersFor(member);

    const teamBetaResponse = await teamFixture.createTeamViaApi(admin, { name: "Beta Team" });
    expect(teamBetaResponse.status).toBe(201);
    const teamBetaBody = (await teamBetaResponse.json()) as TeamResponse;

    const betaProjectResponse = await client.api.orgs[":organizationSlug"].projects.$post(
      {
        param: { organizationSlug: admin.organization.slug ?? "missing-slug" },
        json: {
          name: "Beta Project",
          teamId: teamBetaBody.team.id,
          sourceLocale: "en-US",
          targetLocales: ["fr-FR"],
        },
      },
      { headers: await authHeadersFor(admin) },
    );
    expect(betaProjectResponse.status).toBe(201);
    const betaProjectBody = (await betaProjectResponse.json()) as ProjectResponse;

    const orgId = betaProjectBody.project.organizationId;
    const betaFile = await insertStoredSourceFile({
      organizationId: orgId,
      projectId: betaProjectBody.project.id,
      filename: "beta-secret.xliff",
    });

    const teamAlphaResponse = await teamFixture.createTeamViaApi(admin, { name: "Alpha Team" });
    expect(teamAlphaResponse.status).toBe(201);
    const teamAlphaBody = (await teamAlphaResponse.json()) as TeamResponse;

    const memberUserId = await getLocalUserId(member.user.workosUserId);
    await db.insert(schema.teamMemberships).values({
      teamId: teamAlphaBody.team.id,
      userId: memberUserId,
      role: "member",
    });

    const apiKey = await insertTeamScopedApiKey({
      organizationId: orgId,
      createdByUserId: memberUserId,
    });

    const downloadResponse = await client.api.v1.files[":fileId"].download.$get(
      { param: { fileId: betaFile.id } },
      { headers: { "x-api-key": apiKey } },
    );

    expect(downloadResponse.status).toBe(404);
  });

  it("denies cross-team job creation for API keys bound to a team member", async () => {
    const admin = createWorkosIdentityWithRole("admin");
    const member = createWorkosIdentityForOrganization(admin.organization, "member");

    await authHeadersFor(admin);
    await authHeadersFor(member);

    const teamBetaResponse = await teamFixture.createTeamViaApi(admin, { name: "Beta Jobs Team" });
    expect(teamBetaResponse.status).toBe(201);
    const teamBetaBody = (await teamBetaResponse.json()) as TeamResponse;

    const betaProjectResponse = await client.api.orgs[":organizationSlug"].projects.$post(
      {
        param: { organizationSlug: admin.organization.slug ?? "missing-slug" },
        json: {
          name: "Beta Jobs Project",
          teamId: teamBetaBody.team.id,
          sourceLocale: "en-US",
          targetLocales: ["fr-FR"],
        },
      },
      { headers: await authHeadersFor(admin) },
    );
    expect(betaProjectResponse.status).toBe(201);
    const betaProjectBody = (await betaProjectResponse.json()) as ProjectResponse;

    const teamAlphaResponse = await teamFixture.createTeamViaApi(admin, {
      name: "Alpha Jobs Team",
    });
    expect(teamAlphaResponse.status).toBe(201);
    const teamAlphaBody = (await teamAlphaResponse.json()) as TeamResponse;

    const memberUserId = await getLocalUserId(member.user.workosUserId);
    await db.insert(schema.teamMemberships).values({
      teamId: teamAlphaBody.team.id,
      userId: memberUserId,
      role: "member",
    });

    const apiKey = await insertTeamScopedApiKey({
      organizationId: betaProjectBody.project.organizationId,
      createdByUserId: memberUserId,
      permissions: ["jobs:read", "jobs:write"],
    });

    const createJobResponse = await client.api.v1.jobs.$post(
      {
        json: {
          type: "string",
          projectId: betaProjectBody.project.id,
          stringInput: {
            sourceText: "Hello",
            sourceLocale: "en-US",
            targetLocales: ["fr-FR"],
          },
        },
      },
      { headers: { "x-api-key": apiKey } },
    );

    expect(createJobResponse.status).toBe(404);
    await expect(createJobResponse.json()).resolves.toMatchObject({ error: "project_not_found" });
  });
});
