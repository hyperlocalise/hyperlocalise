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

import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { testClient } from "hono/testing";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { app, createApp } from "@/api/app";
import { db, schema } from "@/lib/database";
import { upsertExternalTmsJobRecords } from "@/lib/projects/external-tms/external-tms-sync-service";
import * as tmsProviderAssigneeCandidates from "@/lib/providers/jobs/tms-provider-assignee-candidates";
import { encodeProviderProjectId } from "@/lib/providers/jobs/tms-provider-resource-id";
import { ensureDefaultWorkspaceTeam } from "@/lib/teams/default-workspace-team";
import { uniqueTestProjectIdentifier } from "@/lib/projects/issue-identifier/test-project-identifier";
import type { TranslationJobEventData } from "@/lib/workflow/types";

import { createProjectTestFixture } from "./project.fixture";
import { createTeamTestFixture } from "../team/team.fixture";
import { insertStoredSourceFile } from "../public-jobs/public-jobs.fixture";
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
  projectId?: string | null;
  createdByUserId?: string | null;
  ownerUserId?: string | null;
  status?: (typeof schema.jobs.$inferInsert)["status"];
  updatedAt?: Date;
  inputPayload?: (typeof schema.jobs.$inferInsert)["inputPayload"];
}) {
  return db
    .insert(schema.jobs)
    .values({
      id: `job_${randomUUID()}`,
      organizationId: input.organizationId,
      projectId: input.projectId ?? null,
      createdByUserId: input.createdByUserId ?? null,
      ownerUserId: input.ownerUserId ?? null,
      kind: "translation",
      status: input.status ?? "queued",
      updatedAt: input.updatedAt,
      inputPayload: input.inputPayload ?? {
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
      identifier: uniqueTestProjectIdentifier(),
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

describe("project job create", () => {
  const enqueueJob = vi.fn(async (event: TranslationJobEventData) => ({
    ids: [event.jobId],
  }));
  const createClient = testClient(
    createApp({
      jobQueue: {
        enqueue: enqueueJob,
      },
    }),
  );
  const createFixture = createProjectTestFixture(createClient);

  afterEach(async () => {
    vi.clearAllMocks();
    await createFixture.cleanup();
  });

  it("defaults file job metadata.title from filename and UTC time", async () => {
    const { identity, organization, project } = await createFixture.createStoredProjectFixture();
    const headers = await createFixture.authHeadersFor(identity);
    const sourceFile = await insertStoredSourceFile({
      organizationId: organization.id,
      projectId: project.id,
      filename: "messages.json",
      contentType: "application/json",
    });

    const response = await createClient.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].jobs.$post(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          projectId: project.id,
        },
        json: {
          type: "file",
          fileInput: {
            sourceFileId: sourceFile.id,
            fileFormat: "json",
            sourceLocale: "en-US",
            targetLocales: ["fr-FR"],
          },
        },
      },
      { headers },
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as { job: { id: string } };
    const [job] = await db
      .select({ inputPayload: schema.jobs.inputPayload })
      .from(schema.jobs)
      .where(eq(schema.jobs.id, body.job.id))
      .limit(1);

    expect(job?.inputPayload).toMatchObject({
      sourceFileId: sourceFile.id,
    });
    expect(
      (job?.inputPayload as { metadata?: { title?: string } } | undefined)?.metadata?.title,
    ).toMatch(/^messages\.json · \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    expect(enqueueJob).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "translation",
        type: "file",
        jobId: body.job.id,
      }),
    );
  });

  it("keeps an explicit job title over the generated default", async () => {
    const { identity, organization, project } = await createFixture.createStoredProjectFixture();
    const headers = await createFixture.authHeadersFor(identity);
    const sourceFile = await insertStoredSourceFile({
      organizationId: organization.id,
      projectId: project.id,
      filename: "messages.json",
      contentType: "application/json",
    });

    const response = await createClient.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].jobs.$post(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          projectId: project.id,
        },
        json: {
          type: "file",
          title: "Release notes · JP + KO",
          fileInput: {
            sourceFileId: sourceFile.id,
            fileFormat: "json",
            sourceLocale: "en-US",
            targetLocales: ["fr-FR"],
          },
        },
      },
      { headers },
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as { job: { id: string } };
    const [job] = await db
      .select({ inputPayload: schema.jobs.inputPayload })
      .from(schema.jobs)
      .where(eq(schema.jobs.id, body.job.id))
      .limit(1);

    expect(job?.inputPayload).toMatchObject({
      metadata: {
        title: "Release notes · JP + KO",
      },
    });
  });
});

describe("project job list triage", () => {
  it("filters Overview triage statuses and ranks review before failed before in-progress", async () => {
    const { identity, organization, project } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);

    const [queuedJob] = await insertNativeJob({
      organizationId: organization.id,
      projectId: project.id,
      status: "queued",
      updatedAt: new Date("2026-08-01T12:00:00.000Z"),
    });
    const [failedJob] = await insertNativeJob({
      organizationId: organization.id,
      projectId: project.id,
      status: "failed",
      updatedAt: new Date("2026-08-01T11:00:00.000Z"),
    });
    const [reviewJob] = await insertNativeJob({
      organizationId: organization.id,
      projectId: project.id,
      status: "waiting_for_review",
      updatedAt: new Date("2026-08-01T10:00:00.000Z"),
    });
    const [succeededJob] = await insertNativeJob({
      organizationId: organization.id,
      projectId: project.id,
      status: "succeeded",
      updatedAt: new Date("2026-08-01T13:00:00.000Z"),
    });

    const response = await client.api.orgs[":organizationSlug"].projects[":projectId"].jobs.$get(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          projectId: project.id,
        },
        query: {
          triage: true,
          limit: "10",
        },
      },
      { headers },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { jobs: Array<{ id: string; status: string }> };
    expect(body.jobs.map((job) => job.id)).toEqual([reviewJob.id, failedJob.id, queuedJob.id]);
    expect(body.jobs.map((job) => job.status)).toEqual(["waiting_for_review", "failed", "queued"]);
    expect(body.jobs.some((job) => job.id === succeededJob.id)).toBe(false);
  });
});

describe("workspace job list triage", () => {
  it("ranks organization triage jobs review before failed before in-progress", async () => {
    const { identity, organization, project, user } =
      await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);

    const [queuedJob] = await insertNativeJob({
      organizationId: organization.id,
      projectId: project.id,
      ownerUserId: user.id,
      status: "queued",
      updatedAt: new Date("2026-08-01T12:00:00.000Z"),
    });
    const [failedJob] = await insertNativeJob({
      organizationId: organization.id,
      projectId: project.id,
      ownerUserId: user.id,
      status: "failed",
      updatedAt: new Date("2026-08-01T11:00:00.000Z"),
    });
    const [reviewJob] = await insertNativeJob({
      organizationId: organization.id,
      projectId: project.id,
      ownerUserId: user.id,
      status: "waiting_for_review",
      updatedAt: new Date("2026-08-01T10:00:00.000Z"),
    });
    const [succeededJob] = await insertNativeJob({
      organizationId: organization.id,
      projectId: project.id,
      ownerUserId: user.id,
      status: "succeeded",
      updatedAt: new Date("2026-08-01T13:00:00.000Z"),
    });
    const [unownedReviewJob] = await insertNativeJob({
      organizationId: organization.id,
      projectId: project.id,
      status: "waiting_for_review",
      updatedAt: new Date("2026-08-01T14:00:00.000Z"),
    });

    const response = await client.api.orgs[":organizationSlug"].jobs.$get(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
        },
        query: {
          triage: true,
          relationship: "assigned",
          limit: "10",
        },
      },
      { headers },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { jobs: Array<{ id: string; status: string }> };
    expect(body.jobs.map((job) => job.id)).toEqual([reviewJob.id, failedJob.id, queuedJob.id]);
    expect(body.jobs.map((job) => job.status)).toEqual(["waiting_for_review", "failed", "queued"]);
    expect(body.jobs.some((job) => job.id === succeededJob.id)).toBe(false);
    expect(body.jobs.some((job) => job.id === unownedReviewJob.id)).toBe(false);
  });
});

describe("workspace job update", () => {
  it("updates native job title, description, and owner", async () => {
    const { identity, organization, project, user } =
      await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);
    const [job] = await insertNativeJob({
      organizationId: organization.id,
      projectId: project.id,
      createdByUserId: user.id,
    });

    const response = await client.api.orgs[":organizationSlug"].jobs[":jobId"].$patch(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          jobId: job.id,
        },
        json: {
          title: "Updated launch copy",
          description: "Please prioritize EU locales",
          ownerWorkosUserId: identity.user.workosUserId,
        },
      },
      { headers },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      job: {
        ownerUserId: string | null;
        inputPayload: { metadata?: { title?: string; description?: string } };
      };
    };
    expect(body.job.ownerUserId).toBe(user.id);
    expect(body.job.inputPayload.metadata).toMatchObject({
      title: "Updated launch copy",
      description: "Please prioritize EU locales",
    });
  });

  it("unassigns a native job owner", async () => {
    const { identity, organization, project, user } =
      await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);
    const [job] = await insertNativeJob({
      organizationId: organization.id,
      projectId: project.id,
      createdByUserId: user.id,
      ownerUserId: user.id,
    });

    const response = await client.api.orgs[":organizationSlug"].jobs[":jobId"].$patch(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          jobId: job.id,
        },
        json: {
          ownerWorkosUserId: null,
        },
      },
      { headers },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { job: { ownerUserId: string | null } };
    expect(body.job.ownerUserId).toBeNull();
  });

  it("rejects assignee updates for users without project access", async () => {
    const { identity, organization, project } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);
    const outsider = projectFixture.createWorkosIdentityForOrganization(
      identity.organization,
      "translator",
    );
    await projectFixture.authHeadersFor(outsider);
    const [job] = await insertNativeJob({
      organizationId: organization.id,
      projectId: project.id,
    });

    const response = await client.api.orgs[":organizationSlug"].jobs[":jobId"].$patch(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          jobId: job.id,
        },
        json: {
          ownerWorkosUserId: outsider.user.workosUserId,
        },
      },
      { headers },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "assignee_not_assignable",
    });
  });

  it("rejects native updates for provider-backed jobs", async () => {
    const { identity, organization, project } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);

    await upsertExternalTmsJobRecords({
      organizationId: organization.id,
      projectId: project.id,
      providerKind: "crowdin",
      externalProjectId: "crowdin-project",
      tasks: [
        {
          externalJobId: "provider-job-1",
          externalStatus: "todo",
          title: "Provider task",
          assignedUsers: [],
        },
      ],
    });

    const [providerJob] = await db
      .select({ id: schema.jobs.id })
      .from(schema.jobs)
      .innerJoin(schema.externalJobDetails, eq(schema.externalJobDetails.jobId, schema.jobs.id))
      .where(
        and(
          eq(schema.jobs.organizationId, organization.id),
          eq(schema.externalJobDetails.externalJobId, "provider-job-1"),
        ),
      )
      .limit(1);

    const response = await client.api.orgs[":organizationSlug"].jobs[":jobId"].$patch(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          jobId: providerJob!.id,
        },
        json: { title: "Should not apply" },
      },
      { headers },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: "provider_job_not_updatable",
    });
  });

  it("clears blank descriptions and preserves unrelated metadata on partial updates", async () => {
    const { identity, organization, project, user } =
      await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);
    const [job] = await insertNativeJob({
      organizationId: organization.id,
      projectId: project.id,
      createdByUserId: user.id,
      inputPayload: {
        sourceText: "Hello",
        sourceLocale: "en-US",
        targetLocales: ["fr-FR"],
        metadata: {
          title: "Original title",
          description: "Keep until cleared",
          note: "retain-me",
        },
      },
    });

    const clearDescription = await client.api.orgs[":organizationSlug"].jobs[":jobId"].$patch(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          jobId: job.id,
        },
        json: { description: "   " },
      },
      { headers },
    );

    expect(clearDescription.status).toBe(200);
    const clearedBody = (await clearDescription.json()) as {
      job: {
        inputPayload: { metadata?: Record<string, string> };
      };
    };
    expect(clearedBody.job.inputPayload.metadata).toEqual({
      title: "Original title",
      note: "retain-me",
    });

    const titleOnly = await client.api.orgs[":organizationSlug"].jobs[":jobId"].$patch(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          jobId: job.id,
        },
        json: { title: "Retitled job" },
      },
      { headers },
    );

    expect(titleOnly.status).toBe(200);
    const titledBody = (await titleOnly.json()) as {
      job: {
        inputPayload: { metadata?: Record<string, string> };
      };
    };
    expect(titledBody.job.inputPayload.metadata).toEqual({
      title: "Retitled job",
      note: "retain-me",
    });
  });

  it("rejects owner updates when the job has no project", async () => {
    const { identity, organization, user } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);
    const [job] = await insertNativeJob({
      organizationId: organization.id,
      projectId: null,
      createdByUserId: user.id,
    });

    const response = await client.api.orgs[":organizationSlug"].jobs[":jobId"].$patch(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          jobId: job.id,
        },
        json: { ownerWorkosUserId: identity.user.workosUserId },
      },
      { headers },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "project_required",
    });
  });
});
