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

describe("NativeCatCommentService.save", () => {
  it("saves comments only and rejects issue type", async () => {
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
      projectId: project.id,
      sourcePath,
    });

    await upsertProjectTranslationKeysFromEntries({
      organizationId: organization.id,
      projectId: project.id,
      repositorySourceFileId: sourceFile.id,
      entries: [{ key: "greeting", text: "Hello", context: null }],
    });

    const [translationKey] = await db
      .select({ id: schema.projectTranslationKeys.id })
      .from(schema.projectTranslationKeys)
      .where(eq(schema.projectTranslationKeys.repositorySourceFileId, sourceFile.id))
      .limit(1);

    const service = new NativeCatCommentService(db, projectTranslationService);
    const comment = await service.save({
      organizationId: organization.id,
      projectId: project.id,
      sourcePath,
      targetLocale: "fr-FR",
      translationKeyId: translationKey!.id,
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
      translationKeyId: translationKey!.id,
      text: "Wrong tone.",
      type: "issue",
      issueType: "translation_mistake",
      actorUserId: user.id,
    });

    expect(issue).toBeNull();

    const listed = await service.listByKeyIds({
      organizationId: organization.id,
      projectId: project.id,
      translationKeyIds: [translationKey!.id],
      targetLocale: "fr-FR",
    });

    expect(listed.get(translationKey!.id)).toHaveLength(1);
    expect(listed.get(translationKey!.id)?.[0]?.type).toBe("comment");
  });
});
