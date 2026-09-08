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

import {
  countNativeSourceWords,
  listNativeProjectLocaleProgress,
} from "./native-project-locale-progress";

const fixture = createProjectTestFixture();

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  await fixture.cleanup();
});

describe("countNativeSourceWords", () => {
  it("returns zero for empty or whitespace-only source text", () => {
    expect(countNativeSourceWords("", "en")).toBe(0);
    expect(countNativeSourceWords("   \n\t  ", "en")).toBe(0);
  });
});

describe("listNativeProjectLocaleProgress", () => {
  it("returns an empty list when there are no keys and no target locales", async () => {
    const { organization, project } = await fixture.createStoredProjectFixture();

    await expect(
      listNativeProjectLocaleProgress({
        organizationId: organization.id,
        projectId: project.id,
        targetLocales: [],
      }),
    ).resolves.toEqual([]);
  });

  it("counts approved empty text toward approval but not translation, and appends orphan locales", async () => {
    const { organization, project } = await fixture.createStoredProjectFixture();

    const [hello, save] = await db
      .insert(schema.projectTranslationKeys)
      .values([
        {
          organizationId: organization.id,
          projectId: project.id,
          key: "hello",
          sourceText: "Hello world",
          normalizedSourceText: "hello world",
        },
        {
          organizationId: organization.id,
          projectId: project.id,
          key: "save",
          sourceText: "Save",
          normalizedSourceText: "save",
        },
      ])
      .returning();

    const earlier = new Date("2026-01-01T00:00:00.000Z");
    const later = new Date("2026-02-01T00:00:00.000Z");

    await db.insert(schema.projectTranslations).values([
      {
        organizationId: organization.id,
        projectId: project.id,
        translationKeyId: hello!.id,
        targetLocale: "fr-FR",
        text: "Bonjour le monde",
        status: "draft",
        updatedAt: earlier,
      },
      {
        organizationId: organization.id,
        projectId: project.id,
        translationKeyId: save!.id,
        targetLocale: "fr-FR",
        text: "",
        status: "approved",
        updatedAt: later,
      },
      {
        organizationId: organization.id,
        projectId: project.id,
        translationKeyId: hello!.id,
        targetLocale: "es-ES",
        text: "Hola mundo",
        status: "approved",
        updatedAt: later,
      },
    ]);

    const rows = await listNativeProjectLocaleProgress({
      organizationId: organization.id,
      projectId: project.id,
      sourceLocale: "en",
      targetLocales: ["fr-FR", "de-DE"],
    });

    expect(rows).toEqual([
      {
        locale: "fr-FR",
        translationProgress: 67,
        approvalProgress: 33,
        words: { total: 3, translated: 2, approved: 1 },
        phrases: { total: 2, translated: 1, approved: 1 },
        lastActivityAt: later.toISOString(),
      },
      {
        locale: "de-DE",
        translationProgress: 0,
        approvalProgress: 0,
        words: { total: 3, translated: 0, approved: 0 },
        phrases: { total: 2, translated: 0, approved: 0 },
        lastActivityAt: null,
      },
      {
        locale: "es-ES",
        translationProgress: 67,
        approvalProgress: 67,
        words: { total: 3, translated: 2, approved: 2 },
        phrases: { total: 2, translated: 1, approved: 1 },
        lastActivityAt: later.toISOString(),
      },
    ]);
  });
});
