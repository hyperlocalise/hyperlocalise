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
import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it } from "vite-plus/test";

import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { db, schema } from "@/lib/database";
import { ensureRepositorySourceFile } from "@/lib/file-storage/records";
import {
  projectTranslationService,
  upsertProjectTranslationKeysFromEntries,
} from "@/lib/projects/translations/project-translation-service";
import { ensureDefaultWorkspaceTeam } from "@/lib/teams/default-workspace-team";

import { NativeCatCommentService } from "./native-cat-comment-service";

const authFixture = createAuthTestFixture();

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  await authFixture.cleanup();
});

const SOURCE_PATH = "locales/en.json";

async function createProjectWithTranslationKey(input: { organizationId: string; userId: string }) {
  const team = await ensureDefaultWorkspaceTeam(input.organizationId);
  const [project] = await db
    .insert(schema.projects)
    .values({
      id: `project_${randomUUID()}`,
      organizationId: input.organizationId,
      teamId: team.id,
      createdByUserId: input.userId,
      name: "Docs",
      description: "",
      translationContext: "",
      sourceLocale: "en-US",
      targetLocales: ["fr-FR"],
    })
    .returning();

  const sourceFile = await ensureRepositorySourceFile({
    organizationId: input.organizationId,
    projectId: project!.id,
    sourcePath: SOURCE_PATH,
  });

  await upsertProjectTranslationKeysFromEntries({
    organizationId: input.organizationId,
    projectId: project!.id,
    repositorySourceFileId: sourceFile.id,
    entries: [{ key: "greeting", text: "Hello", context: null }],
  });

  const [translationKey] = await db
    .select({ id: schema.projectTranslationKeys.id })
    .from(schema.projectTranslationKeys)
    .where(eq(schema.projectTranslationKeys.repositorySourceFileId, sourceFile.id))
    .limit(1);

  return { project: project!, sourceFile, translationKeyId: translationKey!.id };
}

describe("NativeCatCommentService.save", () => {
  it("saves comments only and rejects issue type", async () => {
    const { organization, user } = await authFixture.createLocalWorkosIdentity();
    const { project, translationKeyId } = await createProjectWithTranslationKey({
      organizationId: organization.id,
      userId: user.id,
    });
    const sourcePath = SOURCE_PATH;

    const service = new NativeCatCommentService(db, projectTranslationService);
    const comment = await service.save({
      organizationId: organization.id,
      projectId: project.id,
      sourcePath,
      targetLocale: "fr-FR",
      translationKeyId,
      text: "Looks good.",
      type: "comment",
      actorUserId: user.id,
    });

    expect(comment).toMatchObject({
      type: "comment",
      text: "Looks good.",
      status: null,
    });

    const issue = await service.save({
      organizationId: organization.id,
      projectId: project.id,
      sourcePath,
      targetLocale: "fr-FR",
      translationKeyId,
      text: "Wrong tone.",
      type: "issue",
      issueType: "translation_mistake",
      actorUserId: user.id,
    });

    expect(issue).toBeNull();

    const listed = await service.listByKeyIds({
      organizationId: organization.id,
      projectId: project.id,
      translationKeyIds: [translationKeyId],
      targetLocale: "fr-FR",
    });

    expect(listed.get(translationKeyId)).toHaveLength(1);
    expect(listed.get(translationKeyId)?.[0]?.type).toBe("comment");
  });
});

describe("NativeCatCommentService legacy issue comments", () => {
  it("lists and resolves legacy issue comments that were never mirrored to a sheet issue", async () => {
    const { organization, user } = await authFixture.createLocalWorkosIdentity();
    const { project, translationKeyId } = await createProjectWithTranslationKey({
      organizationId: organization.id,
      userId: user.id,
    });

    const [legacyIssue] = await db
      .insert(schema.projectTranslationComments)
      .values({
        organizationId: organization.id,
        projectId: project.id,
        translationKeyId,
        targetLocale: "fr-FR",
        type: "issue",
        status: "unresolved",
        text: "Wrong tone.",
        issueType: "translation_mistake",
        authorUserId: user.id,
      })
      .returning({ id: schema.projectTranslationComments.id });

    const service = new NativeCatCommentService(db, projectTranslationService);
    const listed = await service.listByKeyIds({
      organizationId: organization.id,
      projectId: project.id,
      translationKeyIds: [translationKeyId],
      targetLocale: "fr-FR",
    });

    expect(listed.get(translationKeyId)).toMatchObject([
      { externalCommentId: legacyIssue!.id, type: "issue", status: "unresolved" },
    ]);

    const resolved = await service.resolveLegacyIssue({
      organizationId: organization.id,
      projectId: project.id,
      commentId: legacyIssue!.id,
      actorUserId: user.id,
    });

    expect(resolved).toMatchObject({
      externalCommentId: legacyIssue!.id,
      type: "issue",
      status: "resolved",
    });
  });

  it("hides legacy issue comments that already have a linked sheet issue", async () => {
    const { organization, user } = await authFixture.createLocalWorkosIdentity();
    const { project, translationKeyId } = await createProjectWithTranslationKey({
      organizationId: organization.id,
      userId: user.id,
    });

    const [legacyIssue] = await db
      .insert(schema.projectTranslationComments)
      .values({
        organizationId: organization.id,
        projectId: project.id,
        translationKeyId,
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
      status: "open",
      targetLocale: "fr-FR",
      translationKeyId,
      linkedCommentId: legacyIssue!.id,
      reporterUserId: user.id,
    });

    const service = new NativeCatCommentService(db, projectTranslationService);
    const listed = await service.listByKeyIds({
      organizationId: organization.id,
      projectId: project.id,
      translationKeyIds: [translationKeyId],
      targetLocale: "fr-FR",
    });

    expect(listed.get(translationKeyId)).toBeUndefined();
  });

  it("does not resolve comments that are not legacy issues", async () => {
    const { organization, user } = await authFixture.createLocalWorkosIdentity();
    const { project, translationKeyId } = await createProjectWithTranslationKey({
      organizationId: organization.id,
      userId: user.id,
    });

    const [plainComment] = await db
      .insert(schema.projectTranslationComments)
      .values({
        organizationId: organization.id,
        projectId: project.id,
        translationKeyId,
        targetLocale: "fr-FR",
        type: "comment",
        status: null,
        text: "Looks good.",
        authorUserId: user.id,
      })
      .returning({ id: schema.projectTranslationComments.id });

    const service = new NativeCatCommentService(db, projectTranslationService);

    await expect(
      service.resolveLegacyIssue({
        organizationId: organization.id,
        projectId: project.id,
        commentId: plainComment!.id,
        actorUserId: user.id,
      }),
    ).resolves.toBeNull();
  });
});
