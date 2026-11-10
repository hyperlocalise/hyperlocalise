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

import { afterEach, describe, expect, it } from "vite-plus/test";

import { createProjectTestFixture } from "@/api/routes/project/project.fixture";
import { db, schema } from "@/lib/database/client";

import { keyJobInputPayload, listProjectKeyTags } from "./key-job";

const fixture = createProjectTestFixture();

afterEach(async () => {
  await fixture.cleanup();
});

describe("keyJobInputPayload", () => {
  it("stores languages and drops a workflow task step from metadata", () => {
    expect(
      keyJobInputPayload({
        sourceLocale: "en-US",
        targetLocales: ["fr-FR"],
        stringIds: ["00000000-0000-4000-8000-000000000001"],
        overwriteUnapproved: true,
        metadata: { workflowTaskStep: "edit", ticket: "T-1" },
      }),
    ).toEqual({
      sourceLocale: "en-US",
      targetLocales: ["fr-FR"],
      overwriteUnapproved: true,
      metadata: { ticket: "T-1" },
    });
    expect(
      keyJobInputPayload({
        sourceLocale: "en-US",
        targetLocales: ["de-DE"],
        keys: ["cta.buy"],
      }),
    ).toEqual({
      sourceLocale: "en-US",
      targetLocales: ["de-DE"],
    });
  });
});

describe("listProjectKeyTags", () => {
  it("returns distinct tags used on the project's keys", async () => {
    const { organization, project } = await fixture.createStoredProjectFixture();
    const [sourceFile] = await db
      .insert(schema.repositorySourceFiles)
      .values({ organizationId: organization.id, projectId: project.id, sourcePath: "en.json" })
      .returning({ id: schema.repositorySourceFiles.id });
    await db.insert(schema.projectTranslationKeys).values([
      {
        organizationId: organization.id,
        projectId: project.id,
        repositorySourceFileId: sourceFile!.id,
        key: "a",
        sourceText: "a",
        normalizedSourceText: "a",
        tags: ["checkout", "web"],
      },
      {
        organizationId: organization.id,
        projectId: project.id,
        repositorySourceFileId: sourceFile!.id,
        key: "b",
        sourceText: "b",
        normalizedSourceText: "b",
        tags: ["checkout"],
      },
      {
        organizationId: organization.id,
        projectId: project.id,
        key: "orphan",
        sourceText: "orphan",
        normalizedSourceText: "orphan",
        tags: ["ignored-elsewhere"],
      },
    ]);
    const other = await fixture.createStoredProjectFixture();
    await db.insert(schema.projectTranslationKeys).values({
      organizationId: other.organization.id,
      projectId: other.project.id,
      key: "other",
      sourceText: "other",
      normalizedSourceText: "other",
      tags: ["foreign"],
    });

    expect(await listProjectKeyTags(organization.id, project.id)).toEqual([
      "checkout",
      "ignored-elsewhere",
      "web",
    ]);
    expect(await listProjectKeyTags(organization.id, other.project.id)).toEqual([]);
  });
});
