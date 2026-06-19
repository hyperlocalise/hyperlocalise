import "dotenv/config";

import { randomUUID } from "node:crypto";

import { testClient } from "hono/testing";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { app } from "@/api/app";
import { db, schema } from "@/lib/database";
import { isErr } from "@/lib/primitives/result/results";
import { upsertCrowdinUserConnection } from "@/lib/providers/adapters/crowdin/crowdin-user-connections";
import {
  upsertCrowdinOAuthProviderCredential,
  type CrowdinOAuthTokenBundle,
} from "@/lib/providers/organization-external-tms-provider-credentials";
import { upsertExternalTmsJobRecords } from "@/lib/projects/external-tms/external-tms-sync-service";
import { encodeProviderProjectId } from "@/lib/providers/tms-provider-resource-id";
import { ensureDefaultWorkspaceTeam } from "@/lib/teams/default-workspace-team";

import { createProjectTestFixture } from "./project.fixture";
import type { WorkspaceJobsResponse } from "./job.schema";

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

const client = testClient(app);
const projectFixture = createProjectTestFixture(client);

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  vi.clearAllMocks();
  await projectFixture.cleanup();
});

async function insertNativeJob(input: {
  organizationId: string;
  projectId: string;
  createdByUserId?: string | null;
  ownerUserId?: string | null;
}) {
  return db
    .insert(schema.jobs)
    .values({
      id: `job_${randomUUID()}`,
      organizationId: input.organizationId,
      projectId: input.projectId,
      createdByUserId: input.createdByUserId ?? null,
      ownerUserId: input.ownerUserId ?? null,
      kind: "translation",
      status: "queued",
      inputPayload: {
        sourceText: "Hello",
        sourceLocale: "en-US",
        targetLocales: ["fr-FR"],
      },
    })
    .returning();
}

function crowdinTokenBundle(
  overrides: Partial<CrowdinOAuthTokenBundle> = {},
): CrowdinOAuthTokenBundle {
  return {
    clientId: "client-id",
    clientSecret: "client-secret",
    accessToken: "fresh-access-token",
    refreshToken: "refresh-token",
    tokenType: "bearer",
    expiresAt: "2026-01-01T01:00:00.000Z",
    ...overrides,
  };
}

describe("workspace job list", () => {
  it("filters assigned and created jobs for the current user", async () => {
    const { identity, organization, project, user } =
      await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);

    const [createdNativeJob] = await insertNativeJob({
      organizationId: organization.id,
      projectId: project.id,
      createdByUserId: user.id,
    });
    const [ownedNativeJob] = await insertNativeJob({
      organizationId: organization.id,
      projectId: project.id,
      ownerUserId: user.id,
    });
    const [otherNativeJob] = await insertNativeJob({
      organizationId: organization.id,
      projectId: project.id,
    });

    await upsertExternalTmsJobRecords({
      organizationId: organization.id,
      projectId: project.id,
      providerKind: "crowdin",
      externalProjectId: "crowdin-project",
      tasks: [
        {
          externalJobId: "assigned-to-current-user",
          externalStatus: "todo",
          title: "Assigned to current user",
          assignedUsers: [identity.user.email.toUpperCase()],
        },
        {
          externalJobId: "assigned-to-other-user",
          externalStatus: "todo",
          title: "Assigned to other user",
          assignedUsers: ["someone-else@example.com"],
        },
      ],
    });

    const assignedResponse = await client.api.orgs[":organizationSlug"].jobs.$get(
      {
        param: { organizationSlug: identity.organization.slug ?? "missing-slug" },
        query: { relationship: "assigned", limit: "100" },
      },
      { headers },
    );

    expect(assignedResponse.status).toBe(200);
    const assignedBody = (await assignedResponse.json()) as WorkspaceJobsResponse;
    const assignedJobIds = assignedBody.jobs.map((job) => job.id);

    expect(assignedJobIds).toEqual(
      expect.arrayContaining([
        expect.stringContaining("assigned-to-current-user"),
        ownedNativeJob.id,
      ]),
    );
    expect(assignedJobIds).not.toEqual(expect.arrayContaining([createdNativeJob.id]));
    expect(assignedJobIds).not.toEqual(expect.arrayContaining([otherNativeJob.id]));
    expect(assignedJobIds).not.toEqual(
      expect.arrayContaining([expect.stringContaining("other-user")]),
    );

    const createdResponse = await client.api.orgs[":organizationSlug"].jobs.$get(
      {
        param: { organizationSlug: identity.organization.slug ?? "missing-slug" },
        query: { relationship: "created", limit: "100" },
      },
      { headers },
    );

    expect(createdResponse.status).toBe(200);
    const createdBody = (await createdResponse.json()) as WorkspaceJobsResponse;
    const createdJobIds = createdBody.jobs.map((job) => job.id);

    expect(createdJobIds).toEqual(expect.arrayContaining([createdNativeJob.id]));
    expect(createdJobIds).not.toEqual(expect.arrayContaining([ownedNativeJob.id]));
    expect(createdJobIds).not.toEqual(
      expect.arrayContaining([expect.stringContaining("assigned-to-current-user")]),
    );
  });

  it("returns assigned provider jobs for translators without team project access", async () => {
    const admin = projectFixture.createWorkosIdentityWithRole("admin");
    const translator = projectFixture.createWorkosIdentityForOrganization(
      admin.organization,
      "translator",
    );

    await projectFixture.authHeadersFor(admin);
    const organizationId = globalThis.__testApiAuthContext!.organization.localOrganizationId;
    const defaultTeam = await ensureDefaultWorkspaceTeam(organizationId);
    const providerProjectId = encodeProviderProjectId({
      providerKind: "crowdin",
      externalProjectId: "provider-project",
    });

    await db.insert(schema.projects).values({
      id: providerProjectId,
      organizationId,
      teamId: defaultTeam.id,
      name: "Provider project",
      description: "",
      translationContext: "",
      source: "external_tms",
      externalProviderKind: "crowdin",
      externalProjectId: "provider-project",
      sourceLocale: "en-US",
      targetLocales: ["fr-FR"],
      isActive: true,
    });

    await upsertExternalTmsJobRecords({
      organizationId,
      projectId: providerProjectId,
      providerKind: "crowdin",
      externalProjectId: "provider-project",
      tasks: [
        {
          externalJobId: "assigned-to-translator",
          externalStatus: "todo",
          title: "Assigned to translator",
          assignedUsers: [translator.user.email],
        },
        {
          externalJobId: "assigned-to-someone-else",
          externalStatus: "todo",
          title: "Assigned to someone else",
          assignedUsers: ["someone-else@example.com"],
        },
      ],
    });

    const translatorHeaders = await projectFixture.authHeadersFor(translator);

    const assignedResponse = await client.api.orgs[":organizationSlug"].jobs.$get(
      {
        param: { organizationSlug: translator.organization.slug ?? "missing-slug" },
        query: { relationship: "assigned", limit: "100" },
      },
      { headers: translatorHeaders },
    );

    expect(assignedResponse.status).toBe(200);
    const assignedBody = (await assignedResponse.json()) as WorkspaceJobsResponse;
    expect(assignedBody.jobs.map((job) => job.id)).toEqual(
      expect.arrayContaining([expect.stringContaining("assigned-to-translator")]),
    );
    expect(assignedBody.jobs.map((job) => job.id)).not.toEqual(
      expect.arrayContaining([expect.stringContaining("assigned-to-someone-else")]),
    );

    const workspaceResponse = await client.api.orgs[":organizationSlug"].jobs.$get(
      {
        param: { organizationSlug: translator.organization.slug ?? "missing-slug" },
        query: { limit: "100" },
      },
      { headers: translatorHeaders },
    );

    expect(workspaceResponse.status).toBe(200);
    const workspaceBody = (await workspaceResponse.json()) as WorkspaceJobsResponse;
    expect(workspaceBody.jobs).toEqual([]);

    const createdResponse = await client.api.orgs[":organizationSlug"].jobs.$get(
      {
        param: { organizationSlug: translator.organization.slug ?? "missing-slug" },
        query: { relationship: "created", limit: "100" },
      },
      { headers: translatorHeaders },
    );

    expect(createdResponse.status).toBe(200);
    const createdBody = (await createdResponse.json()) as WorkspaceJobsResponse;
    expect(createdBody.jobs).toEqual([]);
  });

  it("matches assigned provider jobs from a linked Crowdin username", async () => {
    const admin = projectFixture.createWorkosIdentityWithRole("admin");
    const translator = projectFixture.createWorkosIdentityForOrganization(
      admin.organization,
      "translator",
    );

    await projectFixture.authHeadersFor(admin);
    const organizationId = globalThis.__testApiAuthContext!.organization.localOrganizationId;
    const adminUserId = globalThis.__testApiAuthContext!.user.localUserId;
    const defaultTeam = await ensureDefaultWorkspaceTeam(organizationId);
    const credential = await upsertCrowdinOAuthProviderCredential({
      organizationId,
      userId: adminUserId,
      role: "admin",
      displayName: "Crowdin",
      tokenBundle: crowdinTokenBundle(),
    });
    const providerProjectId = encodeProviderProjectId({
      providerKind: "crowdin",
      externalProjectId: "provider-project",
    });

    await db.insert(schema.projects).values({
      id: providerProjectId,
      organizationId,
      teamId: defaultTeam.id,
      name: "Provider project",
      description: "",
      translationContext: "",
      source: "external_tms",
      externalProviderKind: "crowdin",
      externalProviderCredentialId: credential.id,
      externalProjectId: "provider-project",
      sourceLocale: "en-US",
      targetLocales: ["fr-FR"],
      isActive: true,
    });

    const translatorHeaders = await projectFixture.authHeadersFor(translator);
    const translatorUserId = globalThis.__testApiAuthContext!.user.localUserId;
    const userConnection = await upsertCrowdinUserConnection({
      organizationId,
      userId: translatorUserId,
      providerCredentialId: credential.id,
      tokenBundle: crowdinTokenBundle({ accessToken: "translator-access-token" }),
      crowdinUser: {
        id: 64_001,
        username: "hannah-localizer",
        email: "hannah.provider@example.com",
        fullName: "Hannah Provider",
      },
    });
    expect(isErr(userConnection)).toBe(false);

    await upsertExternalTmsJobRecords({
      organizationId,
      projectId: providerProjectId,
      providerKind: "crowdin",
      externalProjectId: "provider-project",
      tasks: [
        {
          externalJobId: "assigned-by-crowdin-username",
          externalStatus: "todo",
          title: "Assigned by Crowdin username",
          assignedUsers: ["HANNAH-LOCALIZER"],
        },
        {
          externalJobId: "assigned-to-someone-else",
          externalStatus: "todo",
          title: "Assigned to someone else",
          assignedUsers: ["someone-else"],
        },
      ],
    });

    const assignedResponse = await client.api.orgs[":organizationSlug"].jobs.$get(
      {
        param: { organizationSlug: translator.organization.slug ?? "missing-slug" },
        query: { relationship: "assigned", limit: "100" },
      },
      { headers: translatorHeaders },
    );

    expect(assignedResponse.status).toBe(200);
    const assignedBody = (await assignedResponse.json()) as WorkspaceJobsResponse;
    expect(assignedBody.jobs.map((job) => job.id)).toEqual(
      expect.arrayContaining([expect.stringContaining("assigned-by-crowdin-username")]),
    );
    expect(assignedBody.jobs.map((job) => job.id)).not.toEqual(
      expect.arrayContaining([expect.stringContaining("assigned-to-someone-else")]),
    );

    const workspaceResponse = await client.api.orgs[":organizationSlug"].jobs.$get(
      {
        param: { organizationSlug: translator.organization.slug ?? "missing-slug" },
        query: { limit: "100" },
      },
      { headers: translatorHeaders },
    );

    expect(workspaceResponse.status).toBe(200);
    const workspaceBody = (await workspaceResponse.json()) as WorkspaceJobsResponse;
    expect(workspaceBody.jobs).toEqual([]);
  });
});
