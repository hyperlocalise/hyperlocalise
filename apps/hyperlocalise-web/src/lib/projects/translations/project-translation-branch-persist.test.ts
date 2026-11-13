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

import { and, desc, eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it } from "vite-plus/test";

import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { insertStoredSourceFile } from "@/api/routes/public-jobs/public-jobs.fixture";
import { db, schema } from "@/lib/database/client";
import {
  createRepositorySourceFileVersion,
  getRepositorySourceFileVersionForStoredFile,
} from "@/lib/file-storage/records";
import { projectBranchService } from "@/lib/projects/branches/project-branch-service";
import { applyProjectSourceText } from "@/lib/projects/files/source-text-editing";
import { ensureDefaultWorkspaceTeam } from "@/lib/teams/default-workspace-team";

import {
  persistFileJobTranslations,
  upsertProjectTranslationKeysFromEntries,
} from "./project-translation-service";

const authFixture = createAuthTestFixture();

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  await authFixture.cleanup();
});

async function seedBranchedFile() {
  const { organization, user } = await authFixture.createLocalWorkosIdentity();
  const team = await ensureDefaultWorkspaceTeam(organization.id);
  const [project] = await db
    .insert(schema.projects)
    .values({
      id: `project_${randomUUID()}`,
      organizationId: organization.id,
      teamId: team.id,
      createdByUserId: user.id,
      name: "Website",
      description: "",
      translationContext: "",
      sourceLocale: "en-US",
      targetLocales: ["fr-FR"],
      sourceTextEditable: true,
    })
    .returning();

  await projectBranchService.ensureDefaultBranch({
    organizationId: organization.id,
    projectId: project!.id,
    createdByUserId: user.id,
  });

  const storedFile = await insertStoredSourceFile({
    organizationId: organization.id,
    projectId: project!.id,
    filename: "en.json",
    contentType: "application/json",
    sourceKind: "repository_file",
    metadata: { sourcePath: "locales/en.json" },
  });
  const mainVersion = await createRepositorySourceFileVersion({
    storedFile,
    sourcePath: "locales/en.json",
    branchName: "main",
  });
  await upsertProjectTranslationKeysFromEntries({
    organizationId: organization.id,
    projectId: project!.id,
    repositorySourceFileId: mainVersion.repositorySourceFileId,
    entries: [{ key: "greeting", text: "Hello", context: null }],
  });

  const created = await projectBranchService.create({
    organizationId: organization.id,
    projectId: project!.id,
    name: "feature-checkout",
    createdByUserId: user.id,
  });
  expect(created.ok).toBe(true);
  if (!created.ok) {
    throw new Error("failed to create branch");
  }

  const [branchFile] = await db
    .select({ id: schema.repositorySourceFiles.id })
    .from(schema.repositorySourceFiles)
    .where(
      and(
        eq(schema.repositorySourceFiles.projectId, project!.id),
        eq(schema.repositorySourceFiles.sourcePath, "locales/en.json"),
        eq(schema.repositorySourceFiles.branchName, "feature-checkout"),
      ),
    )
    .limit(1);
  const [branchVersion] = await db
    .select()
    .from(schema.repositorySourceFileVersions)
    .where(eq(schema.repositorySourceFileVersions.repositorySourceFileId, branchFile!.id))
    .orderBy(desc(schema.repositorySourceFileVersions.createdAt))
    .limit(1);

  return {
    organization,
    project: project!,
    storedFile,
    mainVersion,
    branchFile: branchFile!,
    branchVersion: branchVersion!,
  };
}

async function translationOnFile(repositorySourceFileId: string) {
  const [row] = await db
    .select({
      text: schema.projectTranslations.text,
      translationKeyId: schema.projectTranslations.translationKeyId,
    })
    .from(schema.projectTranslations)
    .innerJoin(
      schema.projectTranslationKeys,
      eq(schema.projectTranslationKeys.id, schema.projectTranslations.translationKeyId),
    )
    .where(eq(schema.projectTranslationKeys.repositorySourceFileId, repositorySourceFileId))
    .limit(1);
  return row ?? null;
}

describe("file translation jobs on version branches", () => {
  it("persists completed file jobs onto the branch bound on the job, not main", async () => {
    const seeded = await seedBranchedFile();
    const jobId = `job_${randomUUID()}`;
    await db.insert(schema.jobs).values({
      id: jobId,
      organizationId: seeded.organization.id,
      projectId: seeded.project.id,
      kind: "translation",
      status: "queued",
      inputPayload: { sourceFileId: seeded.storedFile.id },
    });
    await db.insert(schema.translationJobDetails).values({
      jobId,
      type: "file",
      sourceFileVersionId: seeded.branchVersion.id,
    });

    await persistFileJobTranslations({
      organizationId: seeded.organization.id,
      projectId: seeded.project.id,
      jobId,
      sourcePath: "locales/en.json",
      sourceLocale: "en-US",
      targetLocale: "fr-FR",
      sourceEntries: { greeting: "Hello" },
      targetEntries: { greeting: "Bonjour" },
    });

    expect(await translationOnFile(seeded.branchFile.id)).toMatchObject({ text: "Bonjour" });
    expect(await translationOnFile(seeded.mainVersion.repositorySourceFileId)).toBeNull();
  });

  it("falls back to the main file when the job has no source version", async () => {
    const seeded = await seedBranchedFile();
    const jobId = `job_${randomUUID()}`;
    await db.insert(schema.jobs).values({
      id: jobId,
      organizationId: seeded.organization.id,
      projectId: seeded.project.id,
      kind: "translation",
      status: "queued",
      inputPayload: { sourceFileId: seeded.storedFile.id },
    });
    await db.insert(schema.translationJobDetails).values({
      jobId,
      type: "file",
    });

    await persistFileJobTranslations({
      organizationId: seeded.organization.id,
      projectId: seeded.project.id,
      jobId,
      sourcePath: "locales/en.json",
      sourceLocale: "en-US",
      targetLocale: "fr-FR",
      sourceEntries: { greeting: "Hello" },
      targetEntries: { greeting: "Bonjour" },
    });

    expect(await translationOnFile(seeded.mainVersion.repositorySourceFileId)).toMatchObject({
      text: "Bonjour",
    });
    expect(await translationOnFile(seeded.branchFile.id)).toBeNull();
  });

  it("prefers the requested branch when a stored blob is shared after a clone", async () => {
    const seeded = await seedBranchedFile();

    const withoutBranch = await getRepositorySourceFileVersionForStoredFile({
      organizationId: seeded.organization.id,
      projectId: seeded.project.id,
      fileId: seeded.storedFile.id,
    });
    expect(withoutBranch?.id).toBe(seeded.mainVersion.id);

    const onBranch = await getRepositorySourceFileVersionForStoredFile({
      organizationId: seeded.organization.id,
      projectId: seeded.project.id,
      fileId: seeded.storedFile.id,
      branchName: "feature-checkout",
    });
    expect(onBranch?.id).toBe(seeded.branchVersion.id);
  });

  it("applies source-text edits from the job's file, not a sibling branch", async () => {
    const seeded = await seedBranchedFile();
    const [mainKey] = await db
      .select({ id: schema.projectTranslationKeys.id })
      .from(schema.projectTranslationKeys)
      .where(
        eq(
          schema.projectTranslationKeys.repositorySourceFileId,
          seeded.mainVersion.repositorySourceFileId,
        ),
      )
      .limit(1);
    const [branchKey] = await db
      .select({ id: schema.projectTranslationKeys.id })
      .from(schema.projectTranslationKeys)
      .where(eq(schema.projectTranslationKeys.repositorySourceFileId, seeded.branchFile.id))
      .limit(1);

    await db
      .update(schema.projectTranslationKeys)
      .set({ sourceText: "Hello main", importedSourceText: "Hello" })
      .where(eq(schema.projectTranslationKeys.id, mainKey!.id));
    await db
      .update(schema.projectTranslationKeys)
      .set({ sourceText: "Hello branch", importedSourceText: "Hello" })
      .where(eq(schema.projectTranslationKeys.id, branchKey!.id));

    const content = Buffer.from('{"greeting":"Hello"}');
    const onMain = await applyProjectSourceText({
      organizationId: seeded.organization.id,
      projectId: seeded.project.id,
      sourcePath: "locales/en.json",
      content,
    });
    expect(onMain.written).toEqual(["greeting"]);
    expect(onMain.content.toString("utf8")).toBe('{"greeting":"Hello main"}');

    const onBranch = await applyProjectSourceText({
      organizationId: seeded.organization.id,
      projectId: seeded.project.id,
      sourcePath: "locales/en.json",
      content,
      repositorySourceFileId: seeded.branchFile.id,
    });
    expect(onBranch.written).toEqual(["greeting"]);
    expect(onBranch.content.toString("utf8")).toBe('{"greeting":"Hello branch"}');
  });
});
