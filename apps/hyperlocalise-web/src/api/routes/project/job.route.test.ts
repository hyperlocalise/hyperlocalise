import "dotenv/config";

import { randomUUID } from "node:crypto";

import { testClient } from "hono/testing";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { app } from "@/api/app";
import { db, schema } from "@/lib/database";
import { upsertExternalTmsJobRecords } from "@/lib/projects/external-tms/external-tms-sync-service";
import * as tmsProviderAssigneeCandidates from "@/lib/providers/tms-provider-assignee-candidates";
import { encodeProviderProjectId } from "@/lib/providers/tms-provider-resource-id";
import { ensureDefaultWorkspaceTeam } from "@/lib/teams/default-workspace-team";

import { createProjectTestFixture } from "./project.fixture";
import { createTeamTestFixture } from "../team/team.fixture";
import type { ProjectResponse } from "./project.schema";
import type { TeamResponse } from "../team/team.schema";
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
const teamFixture = createTeamTestFixture(client);

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

  it("does not match assigned jobs via substring assignee candidates", async () => {
    const assigneeCandidatesSpy = vi
      .spyOn(tmsProviderAssigneeCandidates, "getCurrentUserProviderAssigneeCandidates")
      .mockResolvedValue(["lee"]);

    const { identity, organization, project } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);

    await upsertExternalTmsJobRecords({
      organizationId: organization.id,
      projectId: project.id,
      providerKind: "crowdin",
      externalProjectId: "crowdin-project",
      tasks: [
        {
          externalJobId: "assigned-to-ashlee",
          externalStatus: "todo",
          title: "Assigned to Ashlee",
          assignedUsers: ["Ashlee Johnson"],
        },
        {
          externalJobId: "assigned-to-current-user",
          externalStatus: "todo",
          title: "Assigned to current user",
          assignedUsers: ["lee"],
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
      expect.arrayContaining([expect.stringContaining("assigned-to-current-user")]),
    );
    expect(assignedJobIds).not.toEqual(
      expect.arrayContaining([expect.stringContaining("assigned-to-ashlee")]),
    );

    assigneeCandidatesSpy.mockRestore();
  });

  it("does not return created jobs for projects outside the current team scope", async () => {
    const admin = projectFixture.createWorkosIdentityWithRole("admin");
    const member = projectFixture.createWorkosIdentityForOrganization(admin.organization, "member");
    const { organization: adminOrganization } =
      await projectFixture.createLocalWorkosIdentity(admin);

    await projectFixture.authHeadersFor(member);

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
      { headers: await projectFixture.authHeadersFor(admin) },
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
      { headers: await projectFixture.authHeadersFor(admin) },
    );
    expect(betaProjectResponse.status).toBe(201);
    const betaProjectBody = (await betaProjectResponse.json()) as ProjectResponse;

    const memberUserId = await projectFixture.getLocalUserId(member.user.workosUserId);
    await insertNativeJob({
      organizationId: adminOrganization.id,
      projectId: alphaProjectBody.project.id,
      createdByUserId: memberUserId,
    });
    await insertNativeJob({
      organizationId: adminOrganization.id,
      projectId: betaProjectBody.project.id,
      createdByUserId: memberUserId,
    });

    const createdResponse = await client.api.orgs[":organizationSlug"].jobs.$get(
      {
        param: { organizationSlug: member.organization.slug ?? "missing-slug" },
        query: { relationship: "created", limit: "100" },
      },
      { headers: await projectFixture.authHeadersFor(member) },
    );

    expect(createdResponse.status).toBe(200);
    const createdBody = (await createdResponse.json()) as WorkspaceJobsResponse;
    const createdProjectIds = createdBody.jobs.map((job) => job.projectId);

    expect(createdProjectIds).toEqual([alphaProjectBody.project.id]);
    expect(createdProjectIds).not.toContain(betaProjectBody.project.id);
  });
});
