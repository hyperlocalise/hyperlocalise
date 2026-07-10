import "dotenv/config";

import { and, eq } from "drizzle-orm";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { createStoredFile, fetchImageBytesFromUrl, regenerateImageFromAttachment } = vi.hoisted(
  () => ({
    createStoredFile: vi.fn(),
    fetchImageBytesFromUrl: vi.fn(),
    regenerateImageFromAttachment: vi.fn(),
  }),
);

vi.mock("@/lib/file-storage/records", () => ({
  createStoredFile,
}));

vi.mock("@/lib/projects/files/image-variant-service", () => ({
  fetchImageBytesFromUrl,
}));

vi.mock("@/lib/agents/image-generation", () => ({
  regenerateImageFromAttachment,
}));

import { createProjectTestFixture } from "@/api/routes/project/project.fixture";
import { db, schema } from "@/lib/database";
import { isErr, isOk } from "@/lib/primitives/result/results";

import {
  localizeImageUrlTranslation,
  replaceImageUrlTranslationBytes,
} from "./image-url-translation-service";

const projectFixture = createProjectTestFixture();
const { cleanup, createStoredProjectFixture } = projectFixture;

beforeAll(async () => {
  await db.$client.query("select 1");
});

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(async () => {
  await cleanup();
});

async function createApprovedImageUrlTranslationFixture() {
  const { organization, project } = await createStoredProjectFixture();
  const [key] = await db
    .insert(schema.projectTranslationKeys)
    .values({
      organizationId: organization.id,
      projectId: project.id,
      key: "hero.image",
      sourceText: "https://cdn.example.com/assets/hero.png",
      normalizedSourceText: "https://cdn.example.com/assets/hero.png",
      metadata: { contentKind: "image_url" },
    })
    .returning();

  if (!key) {
    throw new Error("expected translation key fixture to be created");
  }

  const [translation] = await db
    .insert(schema.projectTranslations)
    .values({
      organizationId: organization.id,
      projectId: project.id,
      translationKeyId: key.id,
      targetLocale: "fr-FR",
      text: "https://cdn.example.com/assets/hero-approved-fr.png",
      status: "approved",
      provenance: "manual",
      metadata: {
        contentKind: "image_url",
        storedFileId: "file_existing",
      },
    })
    .returning();

  if (!translation) {
    throw new Error("expected approved translation fixture to be created");
  }

  return { key, organization, project, translation };
}

async function getTranslation(input: { translationKeyId: string; targetLocale: string }) {
  const [translation] = await db
    .select()
    .from(schema.projectTranslations)
    .where(
      and(
        eq(schema.projectTranslations.translationKeyId, input.translationKeyId),
        eq(schema.projectTranslations.targetLocale, input.targetLocale),
      ),
    )
    .limit(1);
  return translation;
}

describe("image URL translation approved locks", () => {
  it("does not localize over an approved image URL translation unless forced", async () => {
    const { key, organization, project } = await createApprovedImageUrlTranslationFixture();

    const result = await localizeImageUrlTranslation({
      organizationId: organization.id,
      projectId: project.id,
      translationKeyId: key.id,
      targetLocale: "fr-FR",
      sourceLocale: "en-US",
      origin: "https://app.example.com",
    });

    expect(isErr(result)).toBe(true);
    if (isOk(result)) {
      throw new Error("expected approved image URL translation to remain locked");
    }
    expect(result.error).toEqual({ code: "approved_locked" });
    expect(fetchImageBytesFromUrl).not.toHaveBeenCalled();
    expect(regenerateImageFromAttachment).not.toHaveBeenCalled();
    expect(createStoredFile).not.toHaveBeenCalled();

    await expect(
      getTranslation({ translationKeyId: key.id, targetLocale: "fr-FR" }),
    ).resolves.toMatchObject({
      text: "https://cdn.example.com/assets/hero-approved-fr.png",
      status: "approved",
      metadata: {
        contentKind: "image_url",
        storedFileId: "file_existing",
      },
    });
  });

  it("does not replace approved image URL translation bytes unless forced", async () => {
    const { key, organization, project } = await createApprovedImageUrlTranslationFixture();

    const result = await replaceImageUrlTranslationBytes({
      organizationId: organization.id,
      projectId: project.id,
      translationKeyId: key.id,
      targetLocale: "fr-FR",
      origin: "https://app.example.com",
      content: Buffer.from("manual-image"),
      contentType: "image/png",
      filename: "hero-fr.png",
    });

    expect(isErr(result)).toBe(true);
    if (isOk(result)) {
      throw new Error("expected approved image URL translation to remain locked");
    }
    expect(result.error).toEqual({ code: "approved_locked" });
    expect(createStoredFile).not.toHaveBeenCalled();

    await expect(
      getTranslation({ translationKeyId: key.id, targetLocale: "fr-FR" }),
    ).resolves.toMatchObject({
      text: "https://cdn.example.com/assets/hero-approved-fr.png",
      status: "approved",
      metadata: {
        contentKind: "image_url",
        storedFileId: "file_existing",
      },
    });
  });
});
