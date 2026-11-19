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

import { and, eq, inArray } from "drizzle-orm";
import { testClient } from "hono/testing";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { app } from "@/api/app";
import type { WorkosAuthIdentity } from "@/api/auth/workos";
import { createAuthTestFixture } from "@/api/test-auth.fixture";
import type { AppType } from "@/api/typed-app";
import { db, schema } from "@/lib/database/client";
import { uniqueTestProjectIdentifier } from "@/lib/projects/issue-identifier/test-project-identifier";
import { SAMPLE_PROJECTS } from "@/lib/sample-workspace/sample-workspace-content";
import { ensureDefaultWorkspaceTeam } from "@/lib/teams/default-workspace-team";

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
  return { ...actual, resolveApiAuthContextFromSession: resolveApiAuthContextFromSessionMock };
});

const client = testClient<AppType>(app);
const fixture = createAuthTestFixture();
const sampleWorkspace = client.api.orgs[":organizationSlug"]["sample-workspace"];

function param(identity: WorkosAuthIdentity) {
  return { organizationSlug: identity.organization.slug ?? "missing-slug" };
}

async function headers(identity: WorkosAuthIdentity) {
  return { headers: await fixture.authHeadersFor(identity) };
}

describe("sampleWorkspaceRoutes", () => {
  beforeAll(async () => {
    await db.$client.query("select 1");
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await fixture.cleanup();
  });

  it("loads sample projects with strings and translations, refuses a second load, and removes them", async () => {
    const admin = fixture.createWorkosIdentityWithRole("admin");

    const before = await sampleWorkspace.$get({ param: param(admin) }, await headers(admin));
    expect(before.status).toBe(200);
    expect(await before.json()).toEqual({ sampleWorkspace: { loaded: false, projects: [] } });

    const loaded = await sampleWorkspace.$post({ param: param(admin) }, await headers(admin));
    expect(loaded.status).toBe(201);
    const body = (await loaded.json()) as {
      sampleWorkspace: { projects: { id: string }[]; fileCount: number; stringCount: number };
    };
    const projectIds = body.sampleWorkspace.projects.map((project) => project.id);
    expect(projectIds).toHaveLength(SAMPLE_PROJECTS.length);
    expect(body.sampleWorkspace.fileCount).toBe(
      SAMPLE_PROJECTS.reduce((total, project) => total + project.files.length, 0),
    );

    const keys = await db
      .select({ id: schema.projectTranslationKeys.id })
      .from(schema.projectTranslationKeys)
      .where(inArray(schema.projectTranslationKeys.projectId, projectIds));
    expect(keys).toHaveLength(body.sampleWorkspace.stringCount);

    const versions = await db
      .select({ ingestState: schema.repositorySourceFileVersions.ingestState })
      .from(schema.repositorySourceFileVersions)
      .where(inArray(schema.repositorySourceFileVersions.projectId, projectIds));
    expect(versions.every((version) => version.ingestState === "ingested")).toBe(true);

    const approvedFrench = await db
      .select({ id: schema.projectTranslations.id })
      .from(schema.projectTranslations)
      .where(
        and(
          inArray(schema.projectTranslations.projectId, projectIds),
          eq(schema.projectTranslations.targetLocale, "fr-FR"),
          eq(schema.projectTranslations.status, "approved"),
        ),
      );
    expect(approvedFrench.length).toBeGreaterThan(0);

    const glossaryLinks = await db
      .select({ glossaryId: schema.projectGlossaries.glossaryId })
      .from(schema.projectGlossaries)
      .where(inArray(schema.projectGlossaries.projectId, projectIds));
    expect(glossaryLinks).toHaveLength(SAMPLE_PROJECTS.length);
    const glossaryId = glossaryLinks[0]!.glossaryId;

    const again = await sampleWorkspace.$post({ param: param(admin) }, await headers(admin));
    expect(again.status).toBe(409);

    const removed = await sampleWorkspace.$delete({ param: param(admin) }, await headers(admin));
    expect(removed.status).toBe(204);

    const remainingProjects = await db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(inArray(schema.projects.id, projectIds));
    expect(remainingProjects).toHaveLength(0);
    const remainingGlossaries = await db
      .select({ id: schema.glossaries.id })
      .from(schema.glossaries)
      .where(eq(schema.glossaries.id, glossaryId));
    expect(remainingGlossaries).toHaveLength(0);

    const after = await sampleWorkspace.$get({ param: param(admin) }, await headers(admin));
    expect(await after.json()).toEqual({ sampleWorkspace: { loaded: false, projects: [] } });
  });

  it("refuses members who cannot manage the workspace", async () => {
    const member = fixture.createWorkosIdentityWithRole("member");

    const response = await sampleWorkspace.$post({ param: param(member) }, await headers(member));
    expect(response.status).toBe(403);
  });

  it("loads sample projects even when the workspace already has a project", async () => {
    const admin = fixture.createWorkosIdentityWithRole("admin");
    const auth = await headers(admin);
    const organizationId = globalThis.__testApiAuthContext!.organization.localOrganizationId;
    const userId = globalThis.__testApiAuthContext!.user.localUserId;
    const team = await ensureDefaultWorkspaceTeam(organizationId);
    const [existing] = await db
      .insert(schema.projects)
      .values({
        id: `project_${crypto.randomUUID()}`,
        identifier: uniqueTestProjectIdentifier(),
        organizationId,
        teamId: team.id,
        createdByUserId: userId,
        name: "Customer project",
        description: "",
        translationContext: "",
        source: "native",
        sourceLocale: "en-US",
        targetLocales: ["fr-FR"],
      })
      .returning({ id: schema.projects.id });

    const loaded = await sampleWorkspace.$post({ param: param(admin) }, auth);
    expect(loaded.status).toBe(201);
    const body = (await loaded.json()) as { sampleWorkspace: { projects: { id: string }[] } };
    expect(body.sampleWorkspace.projects).toHaveLength(SAMPLE_PROJECTS.length);
    expect(body.sampleWorkspace.projects.map((project) => project.id)).not.toContain(existing!.id);

    const projects = await db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(eq(schema.projects.organizationId, organizationId));
    expect(projects).toHaveLength(SAMPLE_PROJECTS.length + 1);
  });
});
