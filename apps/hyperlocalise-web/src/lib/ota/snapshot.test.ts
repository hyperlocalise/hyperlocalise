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

import { afterEach, beforeAll, describe, expect, it } from "vite-plus/test";

import { createProjectTestFixture } from "@/api/routes/project/project.fixture";
import { db, schema } from "@/lib/database/client";

import { buildOtaReleaseSnapshot } from "./snapshot";

const fixture = createProjectTestFixture();

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  await fixture.cleanup();
});

describe("buildOtaReleaseSnapshot", () => {
  it("exports approved translations and source locale text, omitting drafts and hidden keys", async () => {
    const { organization, project } = await fixture.createStoredProjectFixture();
    const [file] = await db
      .insert(schema.repositorySourceFiles)
      .values({
        organizationId: organization.id,
        projectId: project.id,
        sourcePath: "locales/en/messages.json",
      })
      .returning();
    if (!file) {
      throw new Error("expected source file");
    }

    const [greeting] = await db
      .insert(schema.projectTranslationKeys)
      .values({
        organizationId: organization.id,
        projectId: project.id,
        repositorySourceFileId: file.id,
        key: "greeting",
        sourceText: "Hello",
        normalizedSourceText: "hello",
      })
      .returning();
    const [draft] = await db
      .insert(schema.projectTranslationKeys)
      .values({
        organizationId: organization.id,
        projectId: project.id,
        repositorySourceFileId: file.id,
        key: "draft.key",
        sourceText: "Draft",
        normalizedSourceText: "draft",
      })
      .returning();
    const [hidden] = await db
      .insert(schema.projectTranslationKeys)
      .values({
        organizationId: organization.id,
        projectId: project.id,
        repositorySourceFileId: file.id,
        key: "hidden.key",
        sourceText: "Hidden",
        normalizedSourceText: "hidden",
        isHidden: true,
      })
      .returning();
    if (!greeting || !draft || !hidden) {
      throw new Error("expected keys");
    }

    await db.insert(schema.projectTranslations).values([
      {
        organizationId: organization.id,
        projectId: project.id,
        translationKeyId: greeting.id,
        targetLocale: "fr-FR",
        text: "Bonjour",
        status: "approved",
        provenance: "manual",
      },
      {
        organizationId: organization.id,
        projectId: project.id,
        translationKeyId: draft.id,
        targetLocale: "fr-FR",
        text: "Brouillon",
        status: "draft",
        provenance: "manual",
      },
      {
        organizationId: organization.id,
        projectId: project.id,
        translationKeyId: hidden.id,
        targetLocale: "fr-FR",
        text: "Cache",
        status: "approved",
        provenance: "manual",
      },
    ]);

    const snapshot = await buildOtaReleaseSnapshot({
      organizationId: organization.id,
      projectId: project.id,
      fileIds: [file.id],
      locales: ["fr-FR", "en-US"],
      format: "json",
      sourceLocale: "en-US",
    });

    expect(snapshot.manifest.files).toEqual(["/messages.json"]);
    expect(snapshot.manifest.format).toBe("json");
    expect(snapshot.manifest.content["fr-FR"]).toEqual(["/content/fr-FR/messages.json"]);

    const fr = snapshot.files.find(
      (fileRow) => fileRow.relativePath === "/content/fr-FR/messages.json",
    );
    const en = snapshot.files.find(
      (fileRow) => fileRow.relativePath === "/content/en-US/messages.json",
    );
    expect(fr).toBeTruthy();
    expect(en).toBeTruthy();
    expect(JSON.parse(fr!.body.toString("utf8"))).toEqual({ greeting: "Bonjour" });
    expect(JSON.parse(en!.body.toString("utf8"))).toEqual({
      greeting: "Hello",
      "draft.key": "Draft",
    });
  });

  it("exports only files on the requested branch", async () => {
    const { organization, project } = await fixture.createStoredProjectFixture();
    const [mainFile] = await db
      .insert(schema.repositorySourceFiles)
      .values({
        organizationId: organization.id,
        projectId: project.id,
        sourcePath: "locales/en/messages.json",
        branchName: "main",
      })
      .returning();
    const [releaseFile] = await db
      .insert(schema.repositorySourceFiles)
      .values({
        organizationId: organization.id,
        projectId: project.id,
        sourcePath: "locales/en/messages.json",
        branchName: "release",
      })
      .returning();
    if (!mainFile || !releaseFile) {
      throw new Error("expected source files");
    }

    const [mainKey] = await db
      .insert(schema.projectTranslationKeys)
      .values({
        organizationId: organization.id,
        projectId: project.id,
        repositorySourceFileId: mainFile.id,
        key: "cta",
        sourceText: "Buy now",
        normalizedSourceText: "buy now",
      })
      .returning();
    const [releaseKey] = await db
      .insert(schema.projectTranslationKeys)
      .values({
        organizationId: organization.id,
        projectId: project.id,
        repositorySourceFileId: releaseFile.id,
        key: "cta",
        sourceText: "Get it",
        normalizedSourceText: "get it",
      })
      .returning();
    if (!mainKey || !releaseKey) {
      throw new Error("expected keys");
    }

    await db.insert(schema.projectTranslations).values([
      {
        organizationId: organization.id,
        projectId: project.id,
        translationKeyId: mainKey.id,
        targetLocale: "fr-FR",
        text: "Acheter",
        status: "approved",
        provenance: "manual",
      },
      {
        organizationId: organization.id,
        projectId: project.id,
        translationKeyId: releaseKey.id,
        targetLocale: "fr-FR",
        text: "Obtenir",
        status: "approved",
        provenance: "manual",
      },
    ]);

    const releaseSnapshot = await buildOtaReleaseSnapshot({
      organizationId: organization.id,
      projectId: project.id,
      fileIds: [mainFile.id, releaseFile.id],
      locales: ["fr-FR"],
      format: "json",
      sourceLocale: "en-US",
      branchName: "release",
    });
    const fr = releaseSnapshot.files.find(
      (fileRow) => fileRow.relativePath === "/content/fr-FR/messages.json",
    );
    expect(JSON.parse(fr!.body.toString("utf8"))).toEqual({ cta: "Obtenir" });

    const mismatched = await buildOtaReleaseSnapshot({
      organizationId: organization.id,
      projectId: project.id,
      fileIds: [mainFile.id],
      locales: ["fr-FR"],
      format: "json",
      sourceLocale: "en-US",
      branchName: "release",
    });
    expect(mismatched.files).toEqual([]);
    expect(mismatched.manifest.files).toEqual([]);
  });
});
