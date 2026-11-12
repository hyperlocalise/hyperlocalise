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

import { and, eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it } from "vite-plus/test";

import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { db, schema } from "@/lib/database/client";
import { ensureRepositorySourceFile } from "@/lib/file-storage/records";
import { upsertProjectTranslationKeysFromEntries } from "@/lib/projects/translations/project-translation-service";
import { ensureDefaultWorkspaceTeam } from "@/lib/teams/default-workspace-team";

import { projectBranchService } from "./project-branch-service";

const authFixture = createAuthTestFixture();

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  await authFixture.cleanup();
});

describe("ProjectBranchService", () => {
  async function seedProject() {
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
      })
      .returning();

    await projectBranchService.ensureDefaultBranch({
      organizationId: organization.id,
      projectId: project!.id,
      createdByUserId: user.id,
    });

    const sourceFile = await ensureRepositorySourceFile({
      organizationId: organization.id,
      projectId: project!.id,
      sourcePath: "locales/en.json",
      branchName: "main",
    });
    await upsertProjectTranslationKeysFromEntries({
      organizationId: organization.id,
      projectId: project!.id,
      repositorySourceFileId: sourceFile.id,
      entries: [{ key: "greeting", text: "Hello", context: null }],
    });

    return { organization, user, project: project! };
  }

  it("clones files and keys onto a new branch, then merges added strings", async () => {
    const { organization, user, project } = await seedProject();

    const created = await projectBranchService.create({
      organizationId: organization.id,
      projectId: project.id,
      name: "feature/checkout",
      createdByUserId: user.id,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }
    expect(created.value.fileCount).toBe(1);
    expect(created.value.keyCount).toBe(1);

    const featureFile = await ensureRepositorySourceFile({
      organizationId: organization.id,
      projectId: project.id,
      sourcePath: "locales/checkout.json",
      branchName: "feature/checkout",
    });
    await upsertProjectTranslationKeysFromEntries({
      organizationId: organization.id,
      projectId: project.id,
      repositorySourceFileId: featureFile.id,
      entries: [{ key: "pay", text: "Pay now", context: null }],
    });

    const preview = await projectBranchService.previewMerge({
      projectId: project.id,
      sourceName: "feature/checkout",
    });
    expect(preview.ok).toBe(true);
    if (!preview.ok) {
      return;
    }
    expect(preview.value.changes.map((change) => change.kind)).toEqual(["added"]);

    const merged = await projectBranchService.merge({
      projectId: project.id,
      sourceName: "feature/checkout",
      strategy: "use_branch",
    });
    expect(merged.ok).toBe(true);

    const mainFiles = await db
      .select({ sourcePath: schema.repositorySourceFiles.sourcePath })
      .from(schema.repositorySourceFiles)
      .where(
        and(
          eq(schema.repositorySourceFiles.projectId, project.id),
          eq(schema.repositorySourceFiles.branchName, "main"),
        ),
      );
    const mainPaths = mainFiles.map((file) => file.sourcePath);
    expect(mainPaths).toContain("locales/en.json");
    expect(mainPaths).toContain("locales/checkout.json");
  });

  it("blocks writes to a protected branch", async () => {
    const { project } = await seedProject();
    const protectedResult = await projectBranchService.update({
      projectId: project.id,
      name: "main",
      isProtected: true,
    });
    expect(protectedResult.ok).toBe(true);

    const writable = await projectBranchService.assertWritable({
      projectId: project.id,
      branchName: "main",
    });
    expect(writable.ok).toBe(false);
    if (!writable.ok) {
      expect(writable.error).toBe("protected_branch");
    }
  });
});
