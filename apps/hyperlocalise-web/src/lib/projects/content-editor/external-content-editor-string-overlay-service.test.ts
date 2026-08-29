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
import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it } from "vite-plus/test";

import { createProjectTestFixture } from "@/api/routes/project/project.fixture";
import { db, schema } from "@/lib/database/client";
import {
  enrichExternalContentEditorSegmentImageFields,
  enrichExternalContentEditorTranslationImageFields,
  getExternalContentEditorStringOverlay,
  setExternalContentEditorStringTreatAsImage,
} from "@/lib/projects/content-editor/external-content-editor-string-overlay-service";

describe("external CAT string overlay service", () => {
  const projectFixture = createProjectTestFixture();

  beforeAll(async () => {
    await db.$client.query("select 1");
  });

  afterEach(async () => {
    await projectFixture.cleanup();
  });

  it("persists treat-as-image overlays scoped by external resource id", async () => {
    const { organization, user } = await projectFixture.createStoredProjectFixture();
    const projectId = "ext:crowdin:99";
    const sourcePath = "crowdin/home.json";
    const externalStringId = "1001";

    const setResult = await setExternalContentEditorStringTreatAsImage({
      organizationId: organization.id,
      projectId,
      sourcePath,
      externalResourceId: "101",
      externalStringId,
      treatAsImage: true,
      actorUserId: user.id,
    });
    expect(setResult.ok).toBe(true);

    const overlay = await getExternalContentEditorStringOverlay({
      organizationId: organization.id,
      projectId,
      sourcePath,
      externalResourceId: "101",
      externalStringId,
    });
    expect(overlay?.metadata).toMatchObject({ contentKind: "image_url" });

    const otherResource = await getExternalContentEditorStringOverlay({
      organizationId: organization.id,
      projectId,
      sourcePath,
      externalResourceId: "202",
      externalStringId,
    });
    expect(otherResource).toBeNull();

    const clearResult = await setExternalContentEditorStringTreatAsImage({
      organizationId: organization.id,
      projectId,
      sourcePath,
      externalResourceId: "101",
      externalStringId,
      treatAsImage: false,
      actorUserId: user.id,
    });
    expect(clearResult.ok).toBe(true);

    const cleared = await getExternalContentEditorStringOverlay({
      organizationId: organization.id,
      projectId,
      sourcePath,
      externalResourceId: "101",
      externalStringId,
    });
    expect(cleared?.metadata.contentKind).toBeUndefined();

    await db
      .delete(schema.projectContentEditorStringOverlays)
      .where(eq(schema.projectContentEditorStringOverlays.organizationId, organization.id));
  });

  it("enriches segments and translations from overlays and URL heuristics", () => {
    const segment = enrichExternalContentEditorSegmentImageFields({
      externalStringId: "1",
      sourceText: "https://cdn.example.com/hero.png",
      key: "hero",
      context: null,
      type: null,
    });
    expect(segment).toMatchObject({
      looksLikeImageUrl: true,
    });
    expect("contentKind" in segment ? segment.contentKind : undefined).toBeUndefined();

    const treated = enrichExternalContentEditorSegmentImageFields(segment, {
      id: "overlay",
      organizationId: "org",
      projectId: "ext:crowdin:1",
      sourcePath: "a.json",
      externalResourceId: "101",
      externalStringId: "1",
      metadata: { contentKind: "image_url" },
      updatedByUserId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    expect(treated).toMatchObject({
      contentKind: "image_url",
      sourceAssetUrl: "https://cdn.example.com/hero.png",
      looksLikeImageUrl: true,
    });

    const translation = enrichExternalContentEditorTranslationImageFields(
      {
        text: "http://localhost:3000/api/public/media/file_1",
        externalTranslationId: "t1",
        isApproved: false,
      },
      {
        id: "overlay",
        organizationId: "org",
        projectId: "ext:crowdin:1",
        sourcePath: "a.json",
        externalResourceId: "101",
        externalStringId: "1",
        metadata: { contentKind: "image_url" },
        updatedByUserId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    );
    expect(translation).toMatchObject({
      contentKind: "image_url",
      targetAssetUrl: "http://localhost:3000/api/public/media/file_1",
    });
  });
});
