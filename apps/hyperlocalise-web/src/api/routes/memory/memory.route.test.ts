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

import { eq, inArray } from "drizzle-orm";
import { testClient } from "hono/testing";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

const { enqueueActivityLogEventMock, resolveApiAuthContextFromSessionMock } = vi.hoisted(() => ({
  enqueueActivityLogEventMock: vi.fn().mockResolvedValue({
    ok: true,
    value: { createdAt: new Date(), id: "activity-event-1" },
  }),
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

vi.mock("@/lib/activity-log/activity-log-writer", () => ({
  enqueueActivityLogEvent: enqueueActivityLogEventMock,
}));

import { createApp } from "@/api/app";
import type { AppType } from "@/api/typed-app";
import { PRODUCT_USAGE_ANALYTICS_EVENTS } from "@/lib/analytics/events";
import { serverAnalytics } from "@/lib/analytics/server";
import { db, schema } from "@/lib/database/client";
import { uniqueTestProjectIdentifier } from "@/lib/projects/issue-identifier/test-project-identifier";
import { ensureDefaultWorkspaceTeam } from "@/lib/teams/default-workspace-team";
import { createTeamTestFixture } from "@/lib/teams/team.fixture";
import type { TeamResponse } from "@/lib/teams/team.schema";

import type { ProjectResponse } from "../project/project.schema";
import { createMemoryTestFixture } from "./memory.fixture";

const client = testClient<AppType>(createApp());
const fixture = createMemoryTestFixture(client);
const teamFixture = createTeamTestFixture();

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  vi.clearAllMocks();
  await fixture.cleanup();
});

describe("memoryRoutes", () => {
  it("denies memory mutations for roles without memories:write", async () => {
    const deniedRoles = ["member", "developer", "translator", "reviewer"] as const;

    for (const role of deniedRoles) {
      const identity = fixture.createWorkosIdentityWithRole(role);
      const headers = await fixture.authHeadersFor(identity);

      const createResponse = await client.api.orgs[":organizationSlug"][
        "translation-memories"
      ].$post(
        {
          param: { organizationSlug: identity.organization.slug ?? "missing-slug" },
          json: {
            name: "Unauthorized TM",
            description: "Should be forbidden",
          },
        },
        { headers },
      );

      expect(createResponse.status).toBe(403);
      await expect(createResponse.json()).resolves.toMatchObject({
        error: "forbidden",
      });
    }

    const { identity: adminIdentity, memory } = await fixture.createStoredMemoryFixture();
    const member = fixture.createWorkosIdentityForOrganization(
      adminIdentity.organization,
      "member",
    );
    const memberHeaders = await fixture.authHeadersFor(member);
    const organizationSlug = adminIdentity.organization.slug ?? "missing-slug";

    const entryResponse = await client.api.orgs[":organizationSlug"]["translation-memories"][
      ":memoryId"
    ].entries.$post(
      {
        param: {
          organizationSlug,
          memoryId: memory.id,
        },
        json: {
          sourceLocale: "en",
          targetLocale: "es",
          sourceText: "Save",
          targetText: "Guardar",
          matchScore: 100,
        },
      },
      { headers: memberHeaders },
    );
    expect(entryResponse.status).toBe(404);
    await expect(entryResponse.json()).resolves.toMatchObject({
      error: "memory_not_found",
    });

    const deleteResponse = await client.api.orgs[":organizationSlug"]["translation-memories"][
      ":memoryId"
    ].$delete(
      {
        param: {
          organizationSlug,
          memoryId: memory.id,
        },
      },
      { headers: memberHeaders },
    );
    expect(deleteResponse.status).toBe(404);
    await expect(deleteResponse.json()).resolves.toMatchObject({
      error: "memory_not_found",
    });
  });

  it("imports CSV memory entries with quoted multiline cells and clamps match scores", async () => {
    const { identity, memory } = await fixture.createStoredMemoryFixture();
    const headers = await fixture.authHeadersFor(identity);

    const response = await client.api.orgs[":organizationSlug"]["translation-memories"][
      ":memoryId"
    ].entries.import.$post(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          memoryId: memory.id,
        },
        json: {
          format: "csv",
          content: [
            "sourceLocale,targetLocale,sourceText,targetText,score",
            'en,es,"Tap, hold","Mantener\npulsado",150',
            'en,fr,"Line one\nline two","Ligne ""citee""",-15',
          ].join("\r\n"),
        },
      },
      { headers },
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      imported: number;
      skipped: number;
      memoryEntries: Array<{
        sourceLocale: string;
        targetLocale: string;
        sourceText: string;
        targetText: string;
        matchScore: number;
      }>;
    };
    expect(body).toMatchObject({
      imported: 2,
      skipped: 0,
    });
    expect(body.memoryEntries).toEqual([
      expect.objectContaining({
        sourceLocale: "en",
        targetLocale: "es",
        sourceText: "Tap, hold",
        targetText: "Mantener\npulsado",
        matchScore: 100,
      }),
      expect.objectContaining({
        sourceLocale: "en",
        targetLocale: "fr",
        sourceText: "Line one\nline two",
        targetText: 'Ligne "citee"',
        matchScore: 0,
      }),
    ]);
  });

  it("imports Crowdin's locale-header CSV export", async () => {
    const { identity, memory } = await fixture.createStoredMemoryFixture();
    const headers = await fixture.authHeadersFor(identity);

    const response = await client.api.orgs[":organizationSlug"]["translation-memories"][
      ":memoryId"
    ].entries.import.$post(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          memoryId: memory.id,
        },
        json: {
          format: "csv",
          content: ["en,vi", 'Discount,"Khuyến mãi hl"', '"Cancellation Reason","Lý do huỷ"'].join(
            "\n",
          ),
        },
      },
      { headers },
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      imported: number;
      skipped: number;
      memoryEntries: Array<{
        sourceLocale: string;
        targetLocale: string;
        sourceText: string;
        targetText: string;
        matchScore: number;
      }>;
    };
    expect(body).toMatchObject({ imported: 2, skipped: 0 });
    expect(body.memoryEntries).toEqual([
      expect.objectContaining({
        sourceLocale: "en",
        targetLocale: "vi",
        sourceText: "Discount",
        targetText: "Khuyến mãi hl",
        matchScore: 100,
      }),
      expect.objectContaining({
        sourceLocale: "en",
        targetLocale: "vi",
        sourceText: "Cancellation Reason",
        targetText: "Lý do huỷ",
        matchScore: 100,
      }),
    ]);
  });

  it("emits product usage analytics when creating a translation memory", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const trackSpy = vi.spyOn(serverAnalytics, "track").mockImplementation(() => {});

    const response = await fixture.createMemoryViaApi(identity);
    expect(response.status).toBe(201);
    expect(trackSpy).toHaveBeenCalledWith(PRODUCT_USAGE_ANALYTICS_EVENTS.memoryCreated, {
      status: "created",
      source: "memory",
    });
    trackSpy.mockRestore();
  });

  it("filters translation memories by attached project", async () => {
    const { identity, organization, user } = await fixture.createLocalWorkosIdentity();
    const team = await ensureDefaultWorkspaceTeam(organization.id);
    const [firstProject, secondProject] = await db
      .insert(schema.projects)
      .values([
        {
          id: `project_${randomUUID()}`,
          identifier: uniqueTestProjectIdentifier(),
          organizationId: organization.id,
          teamId: team.id,
          createdByUserId: user.id,
          name: "First",
          description: "",
          translationContext: "",
          sourceLocale: "en-US",
          targetLocales: ["fr-FR"],
        },
        {
          id: `project_${randomUUID()}`,
          identifier: uniqueTestProjectIdentifier(),
          organizationId: organization.id,
          teamId: team.id,
          createdByUserId: user.id,
          name: "Second",
          description: "",
          translationContext: "",
          sourceLocale: "en-US",
          targetLocales: ["fr-FR"],
        },
      ])
      .returning();
    const [matchingMemory, otherMemory] = await db
      .insert(schema.memories)
      .values([
        {
          organizationId: organization.id,
          createdByUserId: user.id,
          name: "Matching TM",
          description: "",
        },
        {
          organizationId: organization.id,
          createdByUserId: user.id,
          name: "Other TM",
          description: "",
        },
      ])
      .returning();

    await db.insert(schema.projectMemories).values([
      {
        organizationId: organization.id,
        projectId: firstProject.id,
        memoryId: matchingMemory.id,
        priority: 0,
      },
      {
        organizationId: organization.id,
        projectId: secondProject.id,
        memoryId: otherMemory.id,
        priority: 0,
      },
    ]);

    const headers = await fixture.authHeadersFor(identity);
    const response = await client.api.orgs[":organizationSlug"]["translation-memories"].$get(
      {
        param: { organizationSlug: identity.organization.slug ?? "missing-slug" },
        query: { limit: "50", offset: "0", projectId: firstProject.id },
      },
      { headers },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      total: number;
      memories: Array<{ id: string; name: string }>;
    };
    expect(body.total).toBe(1);
    expect(body.memories).toEqual([
      expect.objectContaining({ id: matchingMemory.id, projectCount: 1 }),
    ]);
  });

  it("filters translation memories by source and includes project counts", async () => {
    const { identity, organization, user } = await fixture.createLocalWorkosIdentity();
    const [nativeMemory, providerMemory] = await db
      .insert(schema.memories)
      .values([
        {
          organizationId: organization.id,
          createdByUserId: user.id,
          name: "Workspace TM",
          description: "",
          source: "native",
        },
        {
          organizationId: organization.id,
          createdByUserId: user.id,
          name: "Provider TM",
          description: "",
          source: "external_tms",
          externalProviderKind: "phrase",
          externalProjectId: "phrase-9",
          externalMemoryId: "tm-9",
        },
      ])
      .returning();

    const headers = await fixture.authHeadersFor(identity);
    const nativeResponse = await client.api.orgs[":organizationSlug"]["translation-memories"].$get(
      {
        param: { organizationSlug: identity.organization.slug ?? "missing-slug" },
        query: { limit: "50", offset: "0", source: "native" },
      },
      { headers },
    );
    const providerResponse = await client.api.orgs[":organizationSlug"][
      "translation-memories"
    ].$get(
      {
        param: { organizationSlug: identity.organization.slug ?? "missing-slug" },
        query: { limit: "50", offset: "0", source: "external_tms" },
      },
      { headers },
    );

    expect(nativeResponse.status).toBe(200);
    expect(providerResponse.status).toBe(200);
    const nativeBody = (await nativeResponse.json()) as {
      total: number;
      memories: Array<{ id: string; projectCount: number }>;
    };
    const providerBody = (await providerResponse.json()) as {
      total: number;
      memories: Array<{ id: string }>;
    };
    expect(nativeBody.total).toBe(1);
    expect(nativeBody.memories).toEqual([
      expect.objectContaining({ id: nativeMemory.id, projectCount: 0 }),
    ]);
    expect(providerBody.total).toBe(1);
    expect(providerBody.memories).toEqual([expect.objectContaining({ id: providerMemory.id })]);
  });

  it("counts only project links the caller can access", async () => {
    const admin = fixture.createWorkosIdentityWithRole("admin");
    const member = fixture.createWorkosIdentityForOrganization(admin.organization, "member");
    const organizationSlug = admin.organization.slug ?? "missing-slug";
    const adminHeaders = await fixture.authHeadersFor(admin);
    const organizationId = globalThis.__testApiAuthContext!.activeOrganization.localOrganizationId;
    const adminUserId = await fixture.getLocalUserId(admin.user.workosUserId);
    const memberHeaders = await fixture.authHeadersFor(member);

    const accessibleTeamResponse = await teamFixture.createTeamViaApi(admin, {
      name: "Accessible Team",
    });
    expect(accessibleTeamResponse.status).toBe(201);
    const accessibleTeam = ((await accessibleTeamResponse.json()) as TeamResponse).team;

    const restrictedTeamResponse = await teamFixture.createTeamViaApi(admin, {
      name: "Restricted Team",
    });
    expect(restrictedTeamResponse.status).toBe(201);
    const restrictedTeam = ((await restrictedTeamResponse.json()) as TeamResponse).team;

    await db.insert(schema.teamMemberships).values({
      teamId: accessibleTeam.id,
      userId: await fixture.getLocalUserId(member.user.workosUserId),
      role: "member",
    });

    const accessibleProjectResponse = await client.api.orgs[":organizationSlug"].projects.$post(
      {
        param: { organizationSlug },
        json: {
          name: "Accessible Project",
          teamId: accessibleTeam.id,
          sourceLocale: "en-US",
          targetLocales: ["fr-FR"],
        },
      },
      { headers: adminHeaders },
    );
    expect(accessibleProjectResponse.status).toBe(201);
    const accessibleProject = ((await accessibleProjectResponse.json()) as ProjectResponse).project;

    const restrictedProjectResponse = await client.api.orgs[":organizationSlug"].projects.$post(
      {
        param: { organizationSlug },
        json: {
          name: "Restricted Project",
          teamId: restrictedTeam.id,
          sourceLocale: "en-US",
          targetLocales: ["fr-FR"],
        },
      },
      { headers: adminHeaders },
    );
    expect(restrictedProjectResponse.status).toBe(201);
    const restrictedProject = ((await restrictedProjectResponse.json()) as ProjectResponse).project;

    const defaultProjectMemories = await db
      .select({
        id: schema.memories.id,
        projectId: schema.projectMemories.projectId,
      })
      .from(schema.projectMemories)
      .innerJoin(schema.memories, eq(schema.memories.id, schema.projectMemories.memoryId))
      .where(
        inArray(schema.projectMemories.projectId, [accessibleProject.id, restrictedProject.id]),
      );
    const accessibleDefaultMemory = defaultProjectMemories.find(
      (row) => row.projectId === accessibleProject.id,
    );
    const restrictedDefaultMemory = defaultProjectMemories.find(
      (row) => row.projectId === restrictedProject.id,
    );
    expect(accessibleDefaultMemory).toBeDefined();
    expect(restrictedDefaultMemory).toBeDefined();

    const [sharedMemory] = await db
      .insert(schema.memories)
      .values({
        organizationId,
        createdByUserId: adminUserId,
        name: "Shared TM",
        description: "",
      })
      .returning();

    await db.insert(schema.projectMemories).values([
      {
        organizationId,
        projectId: accessibleProject.id,
        memoryId: sharedMemory.id,
        priority: 0,
      },
      {
        organizationId,
        projectId: restrictedProject.id,
        memoryId: sharedMemory.id,
        priority: 0,
      },
    ]);

    const response = await client.api.orgs[":organizationSlug"]["translation-memories"].$get(
      {
        param: { organizationSlug },
        query: { limit: "50", offset: "0" },
      },
      { headers: memberHeaders },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      memories: Array<{ id: string; projectCount: number }>;
    };
    expect(body.memories).toHaveLength(2);
    expect(body.memories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: sharedMemory.id, projectCount: 1 }),
        expect.objectContaining({ id: accessibleDefaultMemory!.id, projectCount: 1 }),
      ]),
    );
    expect(body.memories.map((memory) => memory.id)).not.toContain(restrictedDefaultMemory!.id);
  });

  it("removes project attachments when deleting a translation memory", async () => {
    const { identity, organization, user, memory } = await fixture.createStoredMemoryFixture();
    const team = await ensureDefaultWorkspaceTeam(organization.id);
    const [project] = await db
      .insert(schema.projects)
      .values({
        id: `project_${randomUUID()}`,
        identifier: uniqueTestProjectIdentifier(),
        organizationId: organization.id,
        teamId: team.id,
        createdByUserId: user.id,
        name: "Attached",
        description: "",
        translationContext: "",
        sourceLocale: "en-US",
        targetLocales: ["fr-FR"],
      })
      .returning();

    await db.insert(schema.projectMemories).values({
      organizationId: organization.id,
      projectId: project.id,
      memoryId: memory.id,
      priority: 0,
    });

    const headers = await fixture.authHeadersFor(identity);
    const response = await client.api.orgs[":organizationSlug"]["translation-memories"][
      ":memoryId"
    ].$delete(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          memoryId: memory.id,
        },
      },
      { headers },
    );

    expect(response.status).toBe(204);
    const attachments = await db
      .select({ memoryId: schema.projectMemories.memoryId })
      .from(schema.projectMemories)
      .where(eq(schema.projectMemories.memoryId, memory.id));
    expect(attachments).toEqual([]);
  });
});
