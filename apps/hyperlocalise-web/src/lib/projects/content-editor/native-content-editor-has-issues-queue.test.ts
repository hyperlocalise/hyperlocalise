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

describe("native CAT has_issues queue filter", () => {
  async function seedProjectWithKeys() {
    const { organization, user } = await authFixture.createLocalWorkosIdentity();
    const team = await ensureDefaultWorkspaceTeam(organization.id);
    const [project] = await db
      .insert(schema.projects)
      .values({
        id: `project_${randomUUID()}`,
        organizationId: organization.id,
        teamId: team.id,
        createdByUserId: user.id,
        name: "Docs",
        description: "",
        translationContext: "",
        sourceLocale: "en-US",
        targetLocales: ["fr-FR"],
      })
      .returning();

    const sourcePath = "locales/en.json";
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
        { key: "greeting", text: "Hello", context: null },
        { key: "farewell", text: "Goodbye", context: null },
      ],
    });

    const keys = await db
      .select({
        id: schema.projectTranslationKeys.id,
        key: schema.projectTranslationKeys.key,
      })
      .from(schema.projectTranslationKeys)
      .where(eq(schema.projectTranslationKeys.repositorySourceFileId, sourceFile.id));

    const greeting = keys.find((row) => row.key === "greeting");
    const farewell = keys.find((row) => row.key === "farewell");
    expect(greeting).toBeDefined();
    expect(farewell).toBeDefined();

    return {
      organization,
      user,
      project: project!,
      sourcePath,
      greetingKeyId: greeting!.id,
      farewellKeyId: farewell!.id,
    };
  }

  async function loadHasIssuesQueue(input: {
    organizationId: string;
    projectId: string;
    sourcePath: string;
  }) {
    return getNativeProjectContentEditorFile({
      organizationId: input.organizationId,
      projectId: input.projectId,
      sourcePath: input.sourcePath,
      targetLocale: "fr-FR",
      canEditTranslations: true,
      organizationSlug: "acme",
      pagination: {
        offset: 0,
        limit: 50,
        search: undefined,
        queueFilter: "has_issues",
        paginated: true,
      },
    });
  }

  it("includes segments with open sheet issues", async () => {
    const { organization, user, project, sourcePath, greetingKeyId } = await seedProjectWithKeys();

    await db.insert(schema.issueSheetIssues).values({
      organizationId: organization.id,
      projectId: project.id,
      title: "Wrong tone",
      issueType: "translation_mistake",
      status: "open",
      targetLocale: "fr-FR",
      translationKeyId: greetingKeyId,
      reporterUserId: user.id,
    });

    const result = await loadHasIssuesQueue({
      organizationId: organization.id,
      projectId: project.id,
      sourcePath,
    });

    expect(result?.segments.map((segment) => segment.key)).toEqual(["greeting"]);
    expect(result?.pagination?.totalCount).toBe(1);
  });

  it("includes segments with unmirrored legacy issue comments", async () => {
    const { organization, user, project, sourcePath, farewellKeyId } = await seedProjectWithKeys();

    await db.insert(schema.projectTranslationComments).values({
      organizationId: organization.id,
      projectId: project.id,
      translationKeyId: farewellKeyId,
      targetLocale: "fr-FR",
      type: "issue",
      status: "unresolved",
      text: "Wrong tone.",
      issueType: "translation_mistake",
      authorUserId: user.id,
    });

    const result = await loadHasIssuesQueue({
      organizationId: organization.id,
      projectId: project.id,
      sourcePath,
    });

    expect(result?.segments.map((segment) => segment.key)).toEqual(["farewell"]);
    expect(result?.pagination?.totalCount).toBe(1);
  });

  it("excludes mirrored legacy comments once the sheet issue is resolved", async () => {
    const { organization, user, project, sourcePath, greetingKeyId } = await seedProjectWithKeys();

    const [legacyIssue] = await db
      .insert(schema.projectTranslationComments)
      .values({
        organizationId: organization.id,
        projectId: project.id,
        translationKeyId: greetingKeyId,
        targetLocale: "fr-FR",
        type: "issue",
        status: "unresolved",
        text: "Wrong tone.",
        issueType: "translation_mistake",
        authorUserId: user.id,
      })
      .returning({ id: schema.projectTranslationComments.id });

    await db.insert(schema.issueSheetIssues).values({
      organizationId: organization.id,
      projectId: project.id,
      title: "Wrong tone.",
      issueType: "translation_mistake",
      status: "resolved",
      targetLocale: "fr-FR",
      translationKeyId: greetingKeyId,
      linkedCommentId: legacyIssue!.id,
      reporterUserId: user.id,
      resolvedAt: new Date(),
    });

    const result = await loadHasIssuesQueue({
      organizationId: organization.id,
      projectId: project.id,
      sourcePath,
    });

    expect(result?.segments).toEqual([]);
    expect(result?.pagination?.totalCount).toBe(0);
  });

  it("includes segments with in_progress sheet issues", async () => {
    const { organization, user, project, sourcePath, greetingKeyId } = await seedProjectWithKeys();

    await db.insert(schema.issueSheetIssues).values({
      organizationId: organization.id,
      projectId: project.id,
      title: "In progress tone fix",
      issueType: "translation_mistake",
      status: "in_progress",
      targetLocale: "fr-FR",
      translationKeyId: greetingKeyId,
      reporterUserId: user.id,
    });

    const result = await loadHasIssuesQueue({
      organizationId: organization.id,
      projectId: project.id,
      sourcePath,
    });

    expect(result?.segments.map((segment) => segment.key)).toEqual(["greeting"]);
    expect(result?.pagination?.totalCount).toBe(1);
  });

  it("scopes sheet and legacy issues to the requested target locale", async () => {
    const { organization, user, project, sourcePath, greetingKeyId, farewellKeyId } =
      await seedProjectWithKeys();

    await db.insert(schema.issueSheetIssues).values({
      organizationId: organization.id,
      projectId: project.id,
      title: "German sheet issue",
      issueType: "translation_mistake",
      status: "open",
      targetLocale: "de-DE",
      translationKeyId: greetingKeyId,
      reporterUserId: user.id,
    });
    await db.insert(schema.projectTranslationComments).values({
      organizationId: organization.id,
      projectId: project.id,
      translationKeyId: farewellKeyId,
      targetLocale: "de-DE",
      type: "issue",
      status: "unresolved",
      text: "German legacy issue",
      issueType: "translation_mistake",
      authorUserId: user.id,
    });

    const result = await loadHasIssuesQueue({
      organizationId: organization.id,
      projectId: project.id,
      sourcePath,
    });

    expect(result?.segments).toEqual([]);
    expect(result?.pagination?.totalCount).toBe(0);
  });

  it("excludes resolved legacy issue comments and non-issue comment types", async () => {
    const { organization, user, project, sourcePath, greetingKeyId, farewellKeyId } =
      await seedProjectWithKeys();

    await db.insert(schema.projectTranslationComments).values([
      {
        organizationId: organization.id,
        projectId: project.id,
        translationKeyId: greetingKeyId,
        targetLocale: "fr-FR",
        type: "issue",
        status: "resolved",
        text: "Already fixed.",
        issueType: "translation_mistake",
        authorUserId: user.id,
      },
      {
        organizationId: organization.id,
        projectId: project.id,
        translationKeyId: farewellKeyId,
        targetLocale: "fr-FR",
        type: "comment",
        status: "unresolved",
        text: "Just a note.",
        authorUserId: user.id,
      },
    ]);

    const result = await loadHasIssuesQueue({
      organizationId: organization.id,
      projectId: project.id,
      sourcePath,
    });

    expect(result?.segments).toEqual([]);
    expect(result?.pagination?.totalCount).toBe(0);
  });

  it("dedupes a segment that has both an open sheet issue and an unmirrored legacy issue", async () => {
    const { organization, user, project, sourcePath, greetingKeyId } = await seedProjectWithKeys();

    await db.insert(schema.issueSheetIssues).values({
      organizationId: organization.id,
      projectId: project.id,
      title: "Sheet issue",
      issueType: "translation_mistake",
      status: "open",
      targetLocale: "fr-FR",
      translationKeyId: greetingKeyId,
      reporterUserId: user.id,
    });
    await db.insert(schema.projectTranslationComments).values({
      organizationId: organization.id,
      projectId: project.id,
      translationKeyId: greetingKeyId,
      targetLocale: "fr-FR",
      type: "issue",
      status: "unresolved",
      text: "Unmirrored legacy",
      issueType: "translation_mistake",
      authorUserId: user.id,
    });

    const result = await loadHasIssuesQueue({
      organizationId: organization.id,
      projectId: project.id,
      sourcePath,
    });

    expect(result?.segments.map((segment) => segment.key)).toEqual(["greeting"]);
    expect(result?.pagination?.totalCount).toBe(1);
  });
});
