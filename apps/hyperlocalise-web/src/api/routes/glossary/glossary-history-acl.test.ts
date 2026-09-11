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

vi.mock("@/lib/activity-log/activity-log-writer", () => ({
  enqueueActivityLogEvent: vi.fn().mockResolvedValue({
    ok: true,
    value: { createdAt: new Date(), id: "activity-event-1" },
  }),
}));

import { createApp } from "@/api/app";
import type { AppType } from "@/api/typed-app";
import { db, schema } from "@/lib/database/client";
import { createMemoryFileStorageAdapter } from "@/lib/file-storage/memory";
import { createTeamTestFixture } from "../team/team.fixture";
import type { TeamResponse } from "../team/team.schema";
import type { ProjectResponse } from "../project/project.schema";
import { createGlossaryTestFixture } from "./glossary.fixture";

const fileStorageAdapter = createMemoryFileStorageAdapter();
const client = testClient<AppType>(createApp({ fileStorageAdapter }));
const fixture = createGlossaryTestFixture(client);
const teamFixture = createTeamTestFixture(client);

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  vi.clearAllMocks();
  await fixture.cleanup();
});

describe("glossary history ACL", () => {
  it("does not leak living team-private glossary history via the deleted-glossary fallback", async () => {
    const admin = fixture.createWorkosIdentityWithRole("admin");
    const outsider = fixture.createWorkosIdentityForOrganization(admin.organization, "translator");
    const organizationSlug = admin.organization.slug ?? "missing-slug";
    const adminHeaders = await fixture.authHeadersFor(admin);
    const organizationId = globalThis.__testApiAuthContext!.organization.localOrganizationId;
    const outsiderHeaders = await fixture.authHeadersFor(outsider);

    const secretTeamResponse = await teamFixture.createTeamViaApi(admin, {
      name: "Secret Glossary Team",
    });
    expect(secretTeamResponse.status).toBe(201);
    const secretTeam = ((await secretTeamResponse.json()) as TeamResponse).team;

    const outsiderTeamResponse = await teamFixture.createTeamViaApi(admin, {
      name: "Outsider Team",
    });
    expect(outsiderTeamResponse.status).toBe(201);
    const outsiderTeam = ((await outsiderTeamResponse.json()) as TeamResponse).team;

    await db.insert(schema.teamMemberships).values({
      teamId: outsiderTeam.id,
      userId: await fixture.getLocalUserId(outsider.user.workosUserId),
      role: "member",
    });

    const secretProjectResponse = await client.api.orgs[":organizationSlug"].projects.$post(
      {
        param: { organizationSlug },
        json: {
          name: "Secret Project",
          teamId: secretTeam.id,
          sourceLocale: "en-US",
          targetLocales: ["es-ES"],
        },
      },
      { headers: adminHeaders },
    );
    expect(secretProjectResponse.status).toBe(201);
    const secretProject = ((await secretProjectResponse.json()) as ProjectResponse).project;

    const createGlossaryResponse = await client.api.orgs[":organizationSlug"].glossaries.$post(
      {
        param: { organizationSlug },
        json: {
          name: "Secret team terms",
          sourceLocale: "en-US",
          controlLevel: "team",
          projectIds: [secretProject.id],
        },
      },
      { headers: adminHeaders },
    );
    expect(createGlossaryResponse.status).toBe(201);
    const glossaryId = ((await createGlossaryResponse.json()) as { glossary: { id: string } })
      .glossary.id;

    await db.insert(schema.glossaryHistoryEvents).values({
      organizationId,
      glossaryId,
      eventType: "updated",
      actorKind: "user",
      changedFields: ["term"],
      changes: [{ field: "term", before: "Confidential", after: "Leaked" }],
      attributes: { resourceKind: "term" },
    });

    const denied = await client.api.orgs[":organizationSlug"].glossaries[
      ":glossaryId"
    ].concepts.history.$get(
      { param: { organizationSlug, glossaryId }, query: { limit: "20" } },
      { headers: outsiderHeaders },
    );
    expect(denied.status).toBe(404);
    await expect(denied.json()).resolves.toMatchObject({ error: "glossary_not_found" });

    const allowed = await client.api.orgs[":organizationSlug"].glossaries[
      ":glossaryId"
    ].concepts.history.$get(
      { param: { organizationSlug, glossaryId }, query: { limit: "20" } },
      { headers: adminHeaders },
    );
    expect(allowed.status).toBe(200);
    const allowedBody = (await allowed.json()) as {
      events: Array<{ changes: Array<{ before: unknown; after: unknown }> }>;
    };
    expect(allowedBody.events[0]?.changes).toEqual([
      { field: "term", before: "Confidential", after: "Leaked" },
    ]);
  });

  it("keeps deleted-glossary history readable for org operators only", async () => {
    const admin = fixture.createWorkosIdentityWithRole("admin");
    const translator = fixture.createWorkosIdentityForOrganization(
      admin.organization,
      "translator",
    );
    const organizationSlug = admin.organization.slug ?? "missing-slug";
    const adminHeaders = await fixture.authHeadersFor(admin);
    await fixture.authHeadersFor(translator);
    const organizationId = globalThis.__testApiAuthContext!.organization.localOrganizationId;

    const createGlossaryResponse = await fixture.createGlossaryViaApi(
      admin,
      { sourceLocale: "en-US" },
      adminHeaders,
    );
    expect(createGlossaryResponse.status).toBe(201);
    const glossaryId = ((await createGlossaryResponse.json()) as { glossary: { id: string } })
      .glossary.id;

    await db.insert(schema.glossaryHistoryEvents).values({
      organizationId,
      glossaryId,
      eventType: "imported",
      actorKind: "user",
      changedFields: ["concepts"],
      changes: [],
      attributes: { resourceKind: "glossary", mode: "replace" },
    });

    await db.delete(schema.glossaries).where(eq(schema.glossaries.id, glossaryId));

    const translatorDenied = await client.api.orgs[":organizationSlug"].glossaries[
      ":glossaryId"
    ].concepts.history.$get(
      { param: { organizationSlug, glossaryId }, query: { limit: "20" } },
      { headers: await fixture.authHeadersFor(translator) },
    );
    expect(translatorDenied.status).toBe(404);

    const adminAllowed = await client.api.orgs[":organizationSlug"].glossaries[
      ":glossaryId"
    ].concepts.history.$get(
      { param: { organizationSlug, glossaryId }, query: { limit: "20" } },
      { headers: adminHeaders },
    );
    expect(adminAllowed.status).toBe(200);
    const body = (await adminAllowed.json()) as { events: Array<{ eventType: string }> };
    expect(body.events.map((event) => event.eventType)).toContain("imported");
  });
});
