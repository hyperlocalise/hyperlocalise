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

import { createProjectTestFixture } from "@/api/routes/project/project.fixture";
import { db, schema } from "@/lib/database/client";

import {
  projectTranslationRevisionColumns,
  recordProjectTranslationRevisions,
  writeProjectTranslations,
} from "./project-translation-revisions";

const projectFixture = createProjectTestFixture();

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  await projectFixture.cleanup();
});

async function createTranslation() {
  const { organization, project } = await projectFixture.createStoredProjectFixture();
  const [key] = await db
    .insert(schema.projectTranslationKeys)
    .values({
      organizationId: organization.id,
      projectId: project.id,
      key: "greeting",
      sourceText: "Hello",
      normalizedSourceText: "hello",
    })
    .returning();
  const [translation] = await db
    .insert(schema.projectTranslations)
    .values({
      organizationId: organization.id,
      projectId: project.id,
      translationKeyId: key.id,
      targetLocale: "fr",
      text: "Bonjour",
      status: "draft",
      provenance: "manual",
    })
    .returning();
  return { organization, key, translation };
}

function saveText(
  input: Awaited<ReturnType<typeof createTranslation>>,
  text: string,
  actorUserId: string | null,
) {
  return writeProjectTranslations(
    db,
    {
      organizationId: input.organization.id,
      translationKeyIds: [input.key.id],
      targetLocales: ["fr"],
    },
    async (tx, before) => {
      const saved = await tx
        .update(schema.projectTranslations)
        .set({ text })
        .where(eq(schema.projectTranslations.id, input.translation.id))
        .returning(projectTranslationRevisionColumns);
      return recordProjectTranslationRevisions(tx, {
        before,
        saved,
        actor: { actorKind: "user", actorUserId },
      });
    },
  );
}

async function readState(translationId: string) {
  const [translation] = await db
    .select({ text: schema.projectTranslations.text })
    .from(schema.projectTranslations)
    .where(eq(schema.projectTranslations.id, translationId));
  const revisions = await db
    .select({ text: schema.projectTranslationRevisions.text })
    .from(schema.projectTranslationRevisions)
    .where(eq(schema.projectTranslationRevisions.translationId, translationId));
  return { text: translation?.text, revisionTexts: revisions.map((row) => row.text).toSorted() };
}

describe("recordProjectTranslationRevisions", () => {
  it("records a baseline and the new revision with the write", async () => {
    const input = await createTranslation();

    const revisionIds = await saveText(input, "Salut", null);

    expect(revisionIds.has(input.translation.id)).toBe(true);
    expect(await readState(input.translation.id)).toEqual({
      text: "Salut",
      revisionTexts: ["Bonjour", "Salut"],
    });
  });

  it("rolls back the translation write when its revision cannot be recorded", async () => {
    const input = await createTranslation();

    await expect(saveText(input, "Salut", randomUUID())).rejects.toThrow();

    expect(await readState(input.translation.id)).toEqual({
      text: "Bonjour",
      revisionTexts: [],
    });
  });
});
