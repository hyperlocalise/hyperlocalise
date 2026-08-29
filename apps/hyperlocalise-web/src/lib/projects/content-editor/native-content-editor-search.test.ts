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

import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it } from "vite-plus/test";

import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { db, schema } from "@/lib/database/client";
import { ensureRepositorySourceFile } from "@/lib/file-storage/records";
import { getNativeProjectContentEditorFile } from "@/lib/projects/content-editor/native-content-editor-service";
import { upsertProjectTranslationKeysFromEntries } from "@/lib/projects/translations/project-translation-service";
import { ensureDefaultWorkspaceTeam } from "@/lib/teams/default-workspace-team";

const authFixture = createAuthTestFixture();

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  await authFixture.cleanup();
});

describe("native CAT queue search", () => {
  async function seedProjectWithSegments() {
    const { organization, user } = await authFixture.createLocalWorkosIdentity();
    const team = await ensureDefaultWorkspaceTeam(organization.id);
    const [project] = await db
      .insert(schema.projects)
      .values({
        id: `project_${randomUUID()}`,
        organizationId: organization.id,
        teamId: team.id,
        createdByUserId: user.id,
        name: "Tourfinder",
        description: "",
        translationContext: "",
        sourceLocale: "en-US",
        targetLocales: ["vi-VN"],
      })
      .returning();

    const sourcePath = "lang/en-US.json";
    const sourceFile = await ensureRepositorySourceFile({
      organizationId: organization.id,
      projectId: project!.id,
      sourcePath,
    });

    await upsertProjectTranslationKeysFromEntries({
      organizationId: organization.id,
      projectId: project!.id,
      repositorySourceFileId: sourceFile.id,
      entries: [
        { key: "nav.last", text: "Last", context: null },
        { key: "hero.title", text: "Welcome home", context: "Homepage hero" },
        { key: "cta.start", text: "Get started finally", context: null },
        { key: "settings.rate_limit", text: "Rate limit exceeded", context: null },
      ],
    });

    const keys = await db
      .select({
        id: schema.projectTranslationKeys.id,
        key: schema.projectTranslationKeys.key,
      })
      .from(schema.projectTranslationKeys)
      .where(eq(schema.projectTranslationKeys.repositorySourceFileId, sourceFile.id));

    const lastKey = keys.find((row) => row.key === "nav.last");
    expect(lastKey).toBeDefined();

    await db.insert(schema.projectTranslations).values({
      organizationId: organization.id,
      projectId: project!.id,
      translationKeyId: lastKey!.id,
      targetLocale: "vi-VN",
      text: "cuối cùng",
      status: "draft",
    });

    return { organization, project: project!, sourcePath };
  }

  async function search(input: {
    organizationId: string;
    projectId: string;
    sourcePath: string;
    search: string;
  }) {
    return getNativeProjectContentEditorFile({
      organizationId: input.organizationId,
      projectId: input.projectId,
      sourcePath: input.sourcePath,
      targetLocale: "vi-VN",
      canEditTranslations: true,
      organizationSlug: "tripsocial",
      pagination: {
        offset: 0,
        limit: 50,
        search: input.search,
        queueFilter: "all",
        paginated: true,
      },
    });
  }

  it("matches source text content", async () => {
    const { organization, project, sourcePath } = await seedProjectWithSegments();
    const result = await search({
      organizationId: organization.id,
      projectId: project.id,
      sourcePath,
      search: "Welcome",
    });

    expect(result?.segments.map((segment) => segment.key)).toEqual(["hero.title"]);
    expect(result?.pagination?.totalCount).toBe(1);
  });

  it("matches multi-word source text case-insensitively", async () => {
    const { organization, project, sourcePath } = await seedProjectWithSegments();
    const result = await search({
      organizationId: organization.id,
      projectId: project.id,
      sourcePath,
      search: "welcome HOME",
    });

    expect(result?.segments.map((segment) => segment.key)).toEqual(["hero.title"]);
  });

  it("matches context text", async () => {
    const { organization, project, sourcePath } = await seedProjectWithSegments();
    const result = await search({
      organizationId: organization.id,
      projectId: project.id,
      sourcePath,
      search: "Homepage hero",
    });

    expect(result?.segments.map((segment) => segment.key)).toEqual(["hero.title"]);
  });

  it("matches target translation text for the active locale", async () => {
    const { organization, project, sourcePath } = await seedProjectWithSegments();
    const result = await search({
      organizationId: organization.id,
      projectId: project.id,
      sourcePath,
      search: "cuối cùng",
    });

    expect(result?.segments.map((segment) => segment.key)).toEqual(["nav.last"]);
    expect(result?.segments[0]?.sourceText).toBe("Last");
    expect(result?.pagination?.totalCount).toBe(1);
  });

  it("treats underscores in the query as literals", async () => {
    const { organization, project, sourcePath } = await seedProjectWithSegments();
    const result = await search({
      organizationId: organization.id,
      projectId: project.id,
      sourcePath,
      search: "rate_limit",
    });

    expect(result?.segments.map((segment) => segment.key)).toEqual(["settings.rate_limit"]);
  });
});
