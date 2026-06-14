import "dotenv/config";

import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { testClient } from "hono/testing";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { app } from "@/api/app";
import { db, schema } from "@/lib/database";
import { addInteractionMessage, createInteraction } from "@/lib/conversations/interactions";
import { encodeProviderProjectId } from "@/lib/providers/tms-provider-resource-id";
import {
  encryptProviderCredential,
  unwrapProviderCredentialCrypto,
} from "@/lib/security/provider-credential-crypto";
import { ensureDefaultWorkspaceTeam } from "@/lib/teams/default-workspace-team";

import { createProjectTestFixture } from "./project.fixture";
import { createTeamTestFixture } from "../team/team.fixture";
import type { ProjectsResponse, ProjectResponse } from "./project.schema";
import type { TeamResponse } from "../team/team.schema";

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

vi.mock("workflow/api", () => ({
  start: vi.fn(async () => ({ runId: "wrun_provider_sync_test" })),
}));

const client = testClient(app);
const projectFixture = createProjectTestFixture(client);
const teamFixture = createTeamTestFixture(client);
const {
  authHeadersFor,
  createWorkosIdentityWithRole,
  createWorkosIdentityForOrganization,
  cleanup,
} = projectFixture;

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  vi.clearAllMocks();
  await cleanup();
});

describe("team-scoped project access", () => {
  it("queues a provider job sync for an external TMS project", async () => {
    const admin = createWorkosIdentityWithRole("admin");
    const headers = await authHeadersFor(admin);
    const organizationId = globalThis.__testApiAuthContext!.organization.localOrganizationId;
    const userId = globalThis.__testApiAuthContext!.user.localUserId;
    const encrypted = unwrapProviderCredentialCrypto(encryptProviderCredential("crowdin-secret"));
    const projectId = encodeProviderProjectId({
      providerKind: "crowdin",
      externalProjectId: "902807",
    });

    const [credential] = await db
      .insert(schema.organizationExternalTmsProviderCredentials)
      .values({
        organizationId,
        createdByUserId: userId,
        updatedByUserId: userId,
        providerKind: "crowdin",
        displayName: "Crowdin",
        authMode: "api_token",
        maskedSecretSuffix: "••••-cret",
        encryptionAlgorithm: encrypted.algorithm,
        ciphertext: encrypted.ciphertext,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        keyVersion: encrypted.keyVersion,
      })
      .returning();

    await db.insert(schema.projects).values({
      id: projectId,
      organizationId,
      teamId: null,
      createdByUserId: userId,
      updatedByUserId: userId,
      name: "Crowdin project",
      description: "",
      translationContext: "",
      source: "external_tms",
      externalProviderKind: "crowdin",
      externalProviderCredentialId: credential.id,
      externalProjectId: "902807",
      sourceLocale: "en",
      targetLocales: ["fr"],
      isActive: true,
    });

    const response = await client.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].jobs.sync.$post(
      {
        param: {
          organizationSlug: admin.organization.slug ?? "missing-slug",
          projectId,
        },
      },
      { headers },
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      providerJobSync: {
        created: true,
        workflowRunIds: ["wrun_provider_sync_test"],
      },
    });

    const [intent] = await db
      .select()
      .from(schema.providerSyncIntents)
      .where(eq(schema.providerSyncIntents.organizationId, organizationId))
      .limit(1);

    expect(intent).toMatchObject({
      providerCredentialId: credential.id,
      providerKind: "crowdin",
      projectId,
      syncKind: "job_task_scan",
      cause: "manual",
      status: "pending",
    });
  });

  it("denies cross-team project access for non-admin members", async () => {
    const admin = createWorkosIdentityWithRole("admin");
    const member = createWorkosIdentityForOrganization(admin.organization, "member");

    await authHeadersFor(admin);
    await authHeadersFor(member);

    const teamAlphaResponse = await teamFixture.createTeamViaApi(admin, { name: "Alpha Team" });
    expect(teamAlphaResponse.status).toBe(201);
    const teamAlphaBody = (await teamAlphaResponse.json()) as TeamResponse;

    const teamBetaResponse = await teamFixture.createTeamViaApi(admin, { name: "Beta Team" });
    expect(teamBetaResponse.status).toBe(201);
    const teamBetaBody = (await teamBetaResponse.json()) as TeamResponse;

    await db.insert(schema.teamMemberships).values({
      teamId: teamAlphaBody.team.id,
      userId: await projectFixture.getLocalUserId(member.user.workosUserId),
      role: "member",
    });

    const alphaProjectResponse = await client.api.orgs[":organizationSlug"].projects.$post(
      {
        param: { organizationSlug: admin.organization.slug ?? "missing-slug" },
        json: {
          name: "Alpha Project",
          teamId: teamAlphaBody.team.id,
          sourceLocale: "en-US",
          targetLocales: ["fr-FR"],
        },
      },
      { headers: await authHeadersFor(admin) },
    );
    expect(alphaProjectResponse.status).toBe(201);
    const alphaProjectBody = (await alphaProjectResponse.json()) as ProjectResponse;

    const betaProjectResponse = await client.api.orgs[":organizationSlug"].projects.$post(
      {
        param: { organizationSlug: admin.organization.slug ?? "missing-slug" },
        json: {
          name: "Beta Project",
          teamId: teamBetaBody.team.id,
          sourceLocale: "en-US",
          targetLocales: ["de-DE"],
        },
      },
      { headers: await authHeadersFor(admin) },
    );
    expect(betaProjectResponse.status).toBe(201);
    const betaProjectBody = (await betaProjectResponse.json()) as ProjectResponse;

    const listResponse = await client.api.orgs[":organizationSlug"].projects.$get(
      {
        param: { organizationSlug: admin.organization.slug ?? "missing-slug" },
      },
      { headers: await authHeadersFor(member) },
    );

    expect(listResponse.status).toBe(200);
    const listBody = (await listResponse.json()) as ProjectsResponse;
    expect(listBody.projects.map((project) => project.id)).toEqual([alphaProjectBody.project.id]);

    const deniedDetailResponse = await client.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].$get(
      {
        param: {
          organizationSlug: admin.organization.slug ?? "missing-slug",
          projectId: betaProjectBody.project.id,
        },
      },
      { headers: await authHeadersFor(member) },
    );

    expect(deniedDetailResponse.status).toBe(404);
  });

  it("allows organization admins to access all team projects", async () => {
    const admin = createWorkosIdentityWithRole("admin");

    const teamResponse = await teamFixture.createTeamViaApi(admin, { name: "Ops Team" });
    const teamBody = (await teamResponse.json()) as TeamResponse;

    const projectResponse = await client.api.orgs[":organizationSlug"].projects.$post(
      {
        param: { organizationSlug: admin.organization.slug ?? "missing-slug" },
        json: {
          name: "Ops Project",
          teamId: teamBody.team.id,
          sourceLocale: "en-US",
          targetLocales: ["fr-FR"],
        },
      },
      { headers: await authHeadersFor(admin) },
    );
    const projectBody = (await projectResponse.json()) as ProjectResponse;

    const listResponse = await client.api.orgs[":organizationSlug"].projects.$get(
      {
        param: { organizationSlug: admin.organization.slug ?? "missing-slug" },
      },
      { headers: await authHeadersFor(admin) },
    );

    expect(listResponse.status).toBe(200);
    const listBody = (await listResponse.json()) as ProjectsResponse;
    expect(listBody.projects.map((project) => project.id)).toContain(projectBody.project.id);
  });

  it("scopes workspace files to accessible projects", async () => {
    const admin = createWorkosIdentityWithRole("admin");
    const member = createWorkosIdentityForOrganization(admin.organization, "member");

    await authHeadersFor(admin);
    await authHeadersFor(member);

    const teamAlphaResponse = await teamFixture.createTeamViaApi(admin, { name: "Files Alpha" });
    const teamAlphaBody = (await teamAlphaResponse.json()) as TeamResponse;
    const teamBetaResponse = await teamFixture.createTeamViaApi(admin, { name: "Files Beta" });
    const teamBetaBody = (await teamBetaResponse.json()) as TeamResponse;

    await db.insert(schema.teamMemberships).values({
      teamId: teamAlphaBody.team.id,
      userId: await projectFixture.getLocalUserId(member.user.workosUserId),
      role: "member",
    });

    const alphaProjectId = `project_${randomUUID()}`;
    const betaProjectId = `project_${randomUUID()}`;

    await db.insert(schema.projects).values([
      {
        id: alphaProjectId,
        organizationId: (
          await db
            .select({ id: schema.organizations.id })
            .from(schema.organizations)
            .where(eq(schema.organizations.slug, admin.organization.slug ?? ""))
            .limit(1)
        )[0]!.id,
        teamId: teamAlphaBody.team.id,
        name: "Alpha Files Project",
      },
      {
        id: betaProjectId,
        organizationId: (
          await db
            .select({ id: schema.organizations.id })
            .from(schema.organizations)
            .where(eq(schema.organizations.slug, admin.organization.slug ?? ""))
            .limit(1)
        )[0]!.id,
        teamId: teamBetaBody.team.id,
        name: "Beta Files Project",
      },
    ]);

    const memberFilesResponse = await client.api.orgs[":organizationSlug"]["workspace-files"].$get(
      {
        param: { organizationSlug: admin.organization.slug ?? "missing-slug" },
        query: { limit: "500" },
      },
      { headers: await authHeadersFor(member) },
    );

    expect(memberFilesResponse.status).toBe(200);
    const memberFilesBody = await memberFilesResponse.json();
    const memberProjectIds = new Set(
      memberFilesBody.files.map((file: { projectId: string }) => file.projectId),
    );
    expect(memberProjectIds.has(betaProjectId)).toBe(false);
  });

  it("allows members to access their own workspace chat conversations", async () => {
    const owner = createWorkosIdentityWithRole("member");
    const teammate = createWorkosIdentityForOrganization(owner.organization, "member");

    await authHeadersFor(owner);
    const orgId = globalThis.__testApiAuthContext!.activeOrganization.localOrganizationId;

    const ownedConversation = await createInteraction({
      organizationId: orgId,
      source: "chat_ui",
      title: "Workspace chat",
    });
    await addInteractionMessage({
      interactionId: ownedConversation.id,
      senderType: "user",
      senderEmail: owner.user.email,
      text: "Translate this workspace upload",
    });

    const teammateConversation = await createInteraction({
      organizationId: orgId,
      source: "chat_ui",
      title: "Teammate workspace chat",
    });
    await addInteractionMessage({
      interactionId: teammateConversation.id,
      senderType: "user",
      senderEmail: teammate.user.email,
      text: "Keep this private",
    });

    const ownerHeaders = await authHeadersFor(owner);
    const ownedResponse = await app.request(
      `/api/orgs/${owner.organization.slug}/conversations/${ownedConversation.id}`,
      {
        method: "GET",
        headers: ownerHeaders,
      },
    );
    expect(ownedResponse.status).toBe(200);

    const teammateResponse = await app.request(
      `/api/orgs/${owner.organization.slug}/conversations/${teammateConversation.id}`,
      {
        method: "GET",
        headers: ownerHeaders,
      },
    );
    expect(teammateResponse.status).toBe(404);
  });

  it("backfills legacy projects onto the default workspace team", async () => {
    const admin = createWorkosIdentityWithRole("admin");
    await authHeadersFor(admin);

    const organization = (
      await db
        .select({ id: schema.organizations.id })
        .from(schema.organizations)
        .where(eq(schema.organizations.slug, admin.organization.slug ?? ""))
        .limit(1)
    )[0]!;

    const legacyProjectId = `project_${randomUUID()}`;
    await db.insert(schema.projects).values({
      id: legacyProjectId,
      organizationId: organization.id,
      name: "Legacy Project",
    });

    const defaultTeam = await ensureDefaultWorkspaceTeam(organization.id);

    const listResponse = await client.api.orgs[":organizationSlug"].projects.$get(
      {
        param: { organizationSlug: admin.organization.slug ?? "missing-slug" },
      },
      { headers: await authHeadersFor(admin) },
    );

    expect(listResponse.status).toBe(200);
    const listBody = (await listResponse.json()) as ProjectsResponse;
    const legacyProject = listBody.projects.find((project) => project.id === legacyProjectId);
    expect(legacyProject?.teamId).toBe(defaultTeam.id);
  });
});
