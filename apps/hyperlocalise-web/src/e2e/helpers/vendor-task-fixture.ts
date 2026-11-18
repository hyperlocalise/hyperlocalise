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

import { db, schema } from "@/lib/database/client";
import { insertJobs } from "@/lib/job-change-events/job-writes";
import { ensureDefaultWorkspaceTeam } from "@/lib/teams/default-workspace-team";

import type { EmulatorIdentity } from "./emulator-identity";

export type VendorTaskFixture = {
  organizationSlug: string;
  projectId: string;
  projectName: string;
  /** The open post-edit task given to the person, on `sourcePath` in French. */
  taskId: string;
  taskTitle: string;
  sourcePath: string;
  sourceTexts: [string, string];
  /** A second file of the same project, with one string, that the task does not cover. */
  otherSourcePath: string;
};

/**
 * Seeds a project with two files and gives the signed-in person an open post-edit task on the
 * first one, in French. The person must have signed in once, so their local rows exist.
 */
export async function provisionVendorTaskFixture(
  identity: EmulatorIdentity,
): Promise<VendorTaskFixture> {
  const [organization] = await db
    .select({ id: schema.organizations.id, slug: schema.organizations.slug })
    .from(schema.organizations)
    .where(eq(schema.organizations.slug, identity.organizationSlug))
    .limit(1);
  const [user] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.workosUserId, identity.workosUserId))
    .limit(1);
  if (!organization?.slug || !user) {
    throw new Error(`E2E workspace or user not found for ${identity.organizationSlug}`);
  }

  const team = await ensureDefaultWorkspaceTeam(organization.id);
  const suffix = randomUUID().slice(0, 8);
  const projectId = `project_${randomUUID()}`;
  const projectName = `Vendor E2E ${suffix}`;
  await db.insert(schema.projects).values({
    id: projectId,
    organizationId: organization.id,
    teamId: team.id,
    name: projectName,
    description: "",
    translationContext: "",
    sourceLocale: "en-US",
    targetLocales: ["fr-FR", "de-DE"],
  });

  async function addFile(sourcePath: string, strings: Array<[key: string, text: string]>) {
    const storedFileId = `file_${randomUUID()}`;
    const filename = sourcePath.split("/").at(-1) ?? sourcePath;
    await db.insert(schema.storedFiles).values({
      id: storedFileId,
      organizationId: organization!.id,
      projectId,
      role: "source",
      sourceKind: "repository_file",
      storageProvider: "vercel_blob",
      storageKey: `e2e/${storedFileId}/${filename}`,
      storageUrl: `https://example.test/${storedFileId}/${filename}`,
      filename,
      contentType: "application/json",
      byteSize: 2,
      sha256: "44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a",
      metadata: { sourcePath },
    });
    const [sourceFile] = await db
      .insert(schema.repositorySourceFiles)
      .values({ organizationId: organization!.id, projectId, sourcePath })
      .returning({ id: schema.repositorySourceFiles.id });
    const [version] = await db
      .insert(schema.repositorySourceFileVersions)
      .values({
        repositorySourceFileId: sourceFile!.id,
        organizationId: organization!.id,
        projectId,
        sourcePath,
        storedFileId,
        ingestState: "ingested",
      })
      .returning({ id: schema.repositorySourceFileVersions.id });
    for (const [key, text] of strings) {
      await db.insert(schema.projectTranslationKeys).values({
        organizationId: organization!.id,
        projectId,
        repositorySourceFileId: sourceFile!.id,
        key,
        sourceText: text,
        normalizedSourceText: text.toLowerCase(),
      });
    }
    return { storedFileId, versionId: version!.id };
  }

  const sourcePath = `locales/vendor-${suffix}.json`;
  const otherSourcePath = `locales/other-${suffix}.json`;
  const sourceTexts: [string, string] = [`Welcome back ${suffix}`, `Sign out ${suffix}`];
  const { storedFileId, versionId } = await addFile(sourcePath, [
    ["home.welcome", sourceTexts[0]],
    ["home.signOut", sourceTexts[1]],
  ]);
  await addFile(otherSourcePath, [["secret.plan", `Not for the vendor ${suffix}`]]);

  const taskId = `job_${randomUUID()}`;
  const taskTitle = `Post-edit: vendor-${suffix}.json`;
  await insertJobs(db, {
    values: {
      id: taskId,
      organizationId: organization.id,
      projectId,
      ownerUserId: user.id,
      assigneeType: "user",
      kind: "proofread",
      status: "waiting_for_review",
      inputPayload: {
        sourceFileId: storedFileId,
        sourceLocale: "en-US",
        targetLocales: ["fr-FR"],
        metadata: { title: taskTitle, workflowTaskStep: "edit", sourcePath },
      },
    },
  });
  // The upload the task was made for: what gives its owner the file.
  await db.insert(schema.translationJobDetails).values({
    jobId: taskId,
    type: "file",
    sourceFileVersionId: versionId,
  });

  return {
    organizationSlug: organization.slug,
    projectId,
    projectName,
    taskId,
    taskTitle,
    sourcePath,
    sourceTexts,
    otherSourcePath,
  };
}
