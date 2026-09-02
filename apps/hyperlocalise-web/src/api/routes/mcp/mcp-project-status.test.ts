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

import { loadMcpProjectStatus } from "@/api/routes/mcp/mcp-project-status";
import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { db, schema } from "@/lib/database/client";
import { ensureRepositorySourceFile } from "@/lib/file-storage/records";
import { uniqueTestProjectIdentifier } from "@/lib/projects/issue-identifier/test-project-identifier";
import {
  countProjectTranslationKeysForProject,
  setProjectTranslationKeysHidden,
  upsertProjectTranslationKeysFromEntries,
} from "@/lib/projects/translations/project-translation-service";
import { ensureDefaultWorkspaceTeam } from "@/lib/teams/default-workspace-team";

const authFixture = createAuthTestFixture();

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  await authFixture.cleanup();
});

async function seedNativeProject(input?: {
  targetLocales?: string[];
  source?: "native" | "external_tms";
}) {
  const { organization, user } = await authFixture.createLocalWorkosIdentity();
  const team = await ensureDefaultWorkspaceTeam(organization.id);
  const [project] = await db
    .insert(schema.projects)
    .values({
      id: `project_${randomUUID()}`,
      identifier: uniqueTestProjectIdentifier(),
      organizationId: organization.id,
      teamId: team.id,
      createdByUserId: user.id,
      name: "Status",
      description: "",
      translationContext: "",
      source: input?.source ?? "native",
      sourceLocale: "en-US",
      targetLocales: input?.targetLocales ?? ["fr-FR"],
    })
    .returning();

  return { organization, project: project! };
}

async function seedFileKeys(input: {
  organizationId: string;
  projectId: string;
  sourcePath: string;
  entries: Array<{ key: string; text: string }>;
}) {
  const sourceFile = await ensureRepositorySourceFile({
    organizationId: input.organizationId,
    projectId: input.projectId,
    sourcePath: input.sourcePath,
  });

  await upsertProjectTranslationKeysFromEntries({
    organizationId: input.organizationId,
    projectId: input.projectId,
    repositorySourceFileId: sourceFile.id,
    entries: input.entries,
  });

  const keys = await db
    .select({
      id: schema.projectTranslationKeys.id,
      key: schema.projectTranslationKeys.key,
    })
    .from(schema.projectTranslationKeys)
    .where(eq(schema.projectTranslationKeys.repositorySourceFileId, sourceFile.id));

  return { sourceFile, keys };
}

async function insertTranslation(input: {
  organizationId: string;
  projectId: string;
  translationKeyId: string;
  targetLocale: string;
  text: string;
  status: "draft" | "needs_review" | "approved" | "rejected";
}) {
  await db.insert(schema.projectTranslations).values(input);
}

describe("loadMcpProjectStatus", () => {
  it("returns zero counts for an empty project", async () => {
    const { organization, project } = await seedNativeProject({
      targetLocales: ["fr-FR", "de-DE"],
    });

    const status = await loadMcpProjectStatus({
      organizationId: organization.id,
      projectId: project.id,
      sourceLocale: project.sourceLocale,
      targetLocales: project.targetLocales,
    });

    expect(status).toMatchObject({
      projectId: project.id,
      sourceLocale: "en-US",
      targetLocales: ["fr-FR", "de-DE"],
      coverageSource: "native_overlay",
    });
    expect(status.files).toBeUndefined();
    expect(status.locales).toEqual([
      {
        locale: "fr-FR",
        total: 0,
        translated: 0,
        untranslated: 0,
        needsReview: 0,
        approved: 0,
        hidden: 0,
      },
      {
        locale: "de-DE",
        total: 0,
        translated: 0,
        untranslated: 0,
        needsReview: 0,
        approved: 0,
        hidden: 0,
      },
    ]);
  });

  it("reports one locale complete and another empty", async () => {
    const { organization, project } = await seedNativeProject({
      targetLocales: ["fr-FR", "de-DE"],
    });
    const { keys } = await seedFileKeys({
      organizationId: organization.id,
      projectId: project.id,
      sourcePath: "locales/en-US.json",
      entries: [
        { key: "hello", text: "Hello" },
        { key: "bye", text: "Goodbye" },
      ],
    });

    for (const key of keys) {
      await insertTranslation({
        organizationId: organization.id,
        projectId: project.id,
        translationKeyId: key.id,
        targetLocale: "fr-FR",
        text: key.key === "hello" ? "Bonjour" : "Au revoir",
        status: "approved",
      });
    }

    const status = await loadMcpProjectStatus({
      organizationId: organization.id,
      projectId: project.id,
      sourceLocale: project.sourceLocale,
      targetLocales: project.targetLocales,
    });

    expect(status.locales).toEqual([
      {
        locale: "fr-FR",
        total: 2,
        translated: 2,
        untranslated: 0,
        needsReview: 0,
        approved: 2,
        hidden: 0,
      },
      {
        locale: "de-DE",
        total: 2,
        translated: 0,
        untranslated: 2,
        needsReview: 0,
        approved: 0,
        hidden: 0,
      },
    ]);
  });

  it("keeps hidden-key counts consistent with CAT queue filters", async () => {
    const { organization, project } = await seedNativeProject();
    const { keys } = await seedFileKeys({
      organizationId: organization.id,
      projectId: project.id,
      sourcePath: "locales/en-US.json",
      entries: [
        { key: "visible.done", text: "Done" },
        { key: "visible.todo", text: "Todo" },
        { key: "hidden.todo", text: "Internal" },
        { key: "visible.review", text: "Review" },
      ],
    });

    const done = keys.find((row) => row.key === "visible.done");
    const hidden = keys.find((row) => row.key === "hidden.todo");
    const review = keys.find((row) => row.key === "visible.review");
    expect(done).toBeDefined();
    expect(hidden).toBeDefined();
    expect(review).toBeDefined();

    await insertTranslation({
      organizationId: organization.id,
      projectId: project.id,
      translationKeyId: done!.id,
      targetLocale: "fr-FR",
      text: "Fait",
      status: "approved",
    });
    await insertTranslation({
      organizationId: organization.id,
      projectId: project.id,
      translationKeyId: review!.id,
      targetLocale: "fr-FR",
      text: "À revoir",
      status: "needs_review",
    });
    await setProjectTranslationKeysHidden({
      organizationId: organization.id,
      projectId: project.id,
      translationKeyIds: [hidden!.id],
      isHidden: true,
    });

    const countInput = {
      organizationId: organization.id,
      projectId: project.id,
      targetLocale: "fr-FR",
    };
    const [total, untranslated, needsReview, approved, hiddenCount] = await Promise.all([
      countProjectTranslationKeysForProject(countInput),
      countProjectTranslationKeysForProject({ ...countInput, queueFilter: "untranslated" }),
      countProjectTranslationKeysForProject({ ...countInput, queueFilter: "needs_review" }),
      countProjectTranslationKeysForProject({ ...countInput, queueFilter: "reviewed" }),
      countProjectTranslationKeysForProject({ ...countInput, queueFilter: "hidden" }),
    ]);

    const status = await loadMcpProjectStatus({
      organizationId: organization.id,
      projectId: project.id,
      sourceLocale: project.sourceLocale,
      targetLocales: project.targetLocales,
    });

    expect(status.locales).toEqual([
      {
        locale: "fr-FR",
        total,
        translated: total - untranslated,
        untranslated,
        needsReview,
        approved,
        hidden: hiddenCount,
      },
    ]);
    expect(status.locales[0]).toEqual({
      locale: "fr-FR",
      total: 4,
      translated: 2,
      untranslated: 2,
      needsReview: 1,
      approved: 1,
      hidden: 1,
    });
    expect(status.locales[0]!.translated + status.locales[0]!.untranslated).toBe(
      status.locales[0]!.total,
    );
  });

  it("scopes optional file rows to the requested source path", async () => {
    const { organization, project } = await seedNativeProject();
    const marketing = await seedFileKeys({
      organizationId: organization.id,
      projectId: project.id,
      sourcePath: "locales/marketing.json",
      entries: [
        { key: "hero", text: "Hero" },
        { key: "cta", text: "Start" },
      ],
    });
    await seedFileKeys({
      organizationId: organization.id,
      projectId: project.id,
      sourcePath: "locales/settings.json",
      entries: [{ key: "save", text: "Save" }],
    });

    for (const key of marketing.keys) {
      await insertTranslation({
        organizationId: organization.id,
        projectId: project.id,
        translationKeyId: key.id,
        targetLocale: "fr-FR",
        text: "Traduit",
        status: "approved",
      });
    }

    const status = await loadMcpProjectStatus({
      organizationId: organization.id,
      projectId: project.id,
      sourceLocale: project.sourceLocale,
      targetLocales: project.targetLocales,
      sourcePath: "locales/marketing.json",
    });

    expect(status.locales).toEqual([
      {
        locale: "fr-FR",
        total: 3,
        translated: 2,
        untranslated: 1,
        needsReview: 0,
        approved: 2,
        hidden: 0,
      },
    ]);
    expect(status.files).toEqual([
      {
        sourcePath: "locales/marketing.json",
        locales: [
          {
            locale: "fr-FR",
            total: 2,
            translated: 2,
            untranslated: 0,
            needsReview: 0,
            approved: 2,
            hidden: 0,
          },
        ],
      },
    ]);
  });

  it("returns native overlay counts for TMS-backed projects", async () => {
    const { organization, project } = await seedNativeProject({
      source: "external_tms",
      targetLocales: ["fr-FR"],
    });

    const status = await loadMcpProjectStatus({
      organizationId: organization.id,
      projectId: project.id,
      sourceLocale: project.sourceLocale,
      targetLocales: project.targetLocales,
    });

    expect(status.coverageSource).toBe("native_overlay");
    expect(status.locales).toEqual([
      {
        locale: "fr-FR",
        total: 0,
        translated: 0,
        untranslated: 0,
        needsReview: 0,
        approved: 0,
        hidden: 0,
      },
    ]);
  });
});
