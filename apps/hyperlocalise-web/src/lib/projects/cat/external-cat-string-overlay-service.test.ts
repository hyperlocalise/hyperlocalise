import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it } from "vite-plus/test";

import { createProjectTestFixture } from "@/api/routes/project/project.fixture";
import { db, schema } from "@/lib/database";
import {
  enrichExternalCatSegmentImageFields,
  enrichExternalCatTranslationImageFields,
  getExternalCatStringOverlay,
  setExternalCatStringTreatAsImage,
} from "@/lib/projects/cat/external-cat-string-overlay-service";

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

    const setResult = await setExternalCatStringTreatAsImage({
      organizationId: organization.id,
      projectId,
      sourcePath,
      externalResourceId: "101",
      externalStringId,
      treatAsImage: true,
      actorUserId: user.id,
    });
    expect(setResult.ok).toBe(true);

    const overlay = await getExternalCatStringOverlay({
      organizationId: organization.id,
      projectId,
      sourcePath,
      externalResourceId: "101",
      externalStringId,
    });
    expect(overlay?.metadata).toMatchObject({ contentKind: "image_url" });

    const otherResource = await getExternalCatStringOverlay({
      organizationId: organization.id,
      projectId,
      sourcePath,
      externalResourceId: "202",
      externalStringId,
    });
    expect(otherResource).toBeNull();

    const clearResult = await setExternalCatStringTreatAsImage({
      organizationId: organization.id,
      projectId,
      sourcePath,
      externalResourceId: "101",
      externalStringId,
      treatAsImage: false,
      actorUserId: user.id,
    });
    expect(clearResult.ok).toBe(true);

    const cleared = await getExternalCatStringOverlay({
      organizationId: organization.id,
      projectId,
      sourcePath,
      externalResourceId: "101",
      externalStringId,
    });
    expect(cleared?.metadata.contentKind).toBeUndefined();

    await db
      .delete(schema.projectCatStringOverlays)
      .where(eq(schema.projectCatStringOverlays.organizationId, organization.id));
  });

  it("enriches segments and translations from overlays and URL heuristics", () => {
    const segment = enrichExternalCatSegmentImageFields({
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

    const treated = enrichExternalCatSegmentImageFields(segment, {
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

    const translation = enrichExternalCatTranslationImageFields(
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
