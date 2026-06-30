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

describe("NativeCatCommentService.resolve", () => {
  it("rejects resolution by a non-author without review permission", async () => {
    const {
      organization,
      user: authorUser,
      identity,
    } = await authFixture.createLocalWorkosIdentity();
    const { user: otherUser } = await authFixture.createLocalWorkosIdentity(
      authFixture.createWorkosIdentityForOrganization(identity.organization, "translator"),
    );
    const team = await ensureDefaultWorkspaceTeam(organization.id);
    const [project] = await db
      .insert(schema.projects)
      .values({
        id: `project_${randomUUID()}`,
        organizationId: organization.id,
        teamId: team.id,
        createdByUserId: authorUser.id,
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
    const posted = await service.save({
      organizationId: organization.id,
      projectId: project.id,
      sourcePath,
      targetLocale: "fr-FR",
      translationKeyId: translationKey!.id,
      text: "Wrong tone.",
      type: "issue",
      issueType: "translation_mistake",
      actorUserId: authorUser.id,
    });

    expect(posted).not.toBeNull();

    const resolved = await service.resolve({
      organizationId: organization.id,
      projectId: project.id,
      commentId: posted!.externalCommentId,
      actorUserId: otherUser.id,
      canResolveOthersIssues: false,
    });

    expect(resolved).toBeNull();
  });

  it("allows reviewers to resolve another user's issue", async () => {
    const {
      organization,
      user: authorUser,
      identity,
    } = await authFixture.createLocalWorkosIdentity();
    const { user: reviewer } = await authFixture.createLocalWorkosIdentity(
      authFixture.createWorkosIdentityForOrganization(identity.organization, "reviewer"),
    );
    const team = await ensureDefaultWorkspaceTeam(organization.id);
    const [project] = await db
      .insert(schema.projects)
      .values({
        id: `project_${randomUUID()}`,
        organizationId: organization.id,
        teamId: team.id,
        createdByUserId: authorUser.id,
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
    const posted = await service.save({
      organizationId: organization.id,
      projectId: project.id,
      sourcePath,
      targetLocale: "fr-FR",
      translationKeyId: translationKey!.id,
      text: "Wrong tone.",
      type: "issue",
      issueType: "translation_mistake",
      actorUserId: authorUser.id,
    });

    const resolved = await service.resolve({
      organizationId: organization.id,
      projectId: project.id,
      commentId: posted!.externalCommentId,
      actorUserId: reviewer.id,
      canResolveOthersIssues: true,
    });

    expect(resolved).toMatchObject({
      externalCommentId: posted!.externalCommentId,
      status: "resolved",
    });
  });
});
