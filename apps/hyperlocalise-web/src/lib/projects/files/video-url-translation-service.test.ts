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

import { and, eq } from "drizzle-orm";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { createStoredFile, fetchVideoBytesFromUrl, regenerateVideoFromAttachment } = vi.hoisted(
  () => ({
    createStoredFile: vi.fn(),
    fetchVideoBytesFromUrl: vi.fn(),
    regenerateVideoFromAttachment: vi.fn(),
  }),
);

vi.mock("@/lib/file-storage/records", () => ({
  createStoredFile,
}));

vi.mock("@/lib/projects/files/video-variant-service", () => ({
  fetchVideoBytesFromUrl,
}));

vi.mock("@/lib/agents/video-generation", () => ({
  VideoLocalizationError: class VideoLocalizationError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.name = "VideoLocalizationError";
      this.code = code;
    }
  },
  regenerateVideoFromAttachment,
}));

import { createProjectTestFixture } from "@/api/routes/project/project.fixture";
import { db, schema } from "@/lib/database/client";
import { isErr, isOk } from "@/lib/primitives/result/results";

import {
  localizeVideoUrlTranslation,
  replaceVideoUrlTranslationBytes,
  setTranslationKeyTreatAsVideo,
} from "./video-url-translation-service";

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

async function createApprovedVideoUrlTranslationFixture() {
  const { organization, project } = await createStoredProjectFixture();
  const [key] = await db
    .insert(schema.projectTranslationKeys)
    .values({
      organizationId: organization.id,
      projectId: project.id,
      key: "hero.video",
      sourceText: "https://cdn.example.com/assets/hero.mp4",
      normalizedSourceText: "https://cdn.example.com/assets/hero.mp4",
      metadata: { contentKind: "video_url" },
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
      text: "https://cdn.example.com/assets/hero-approved-fr.mp4",
      status: "approved",
      provenance: "manual",
      metadata: {
        contentKind: "video_url",
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

describe("setTranslationKeyTreatAsVideo", () => {
  it("sets video_url without clearing unrelated metadata, then clears only video_url", async () => {
    const { organization, project } = await createStoredProjectFixture();
    const [key] = await db
      .insert(schema.projectTranslationKeys)
      .values({
        organizationId: organization.id,
        projectId: project.id,
        key: "hero.video",
        sourceText: "https://cdn.example.com/assets/hero.mp4",
        normalizedSourceText: "https://cdn.example.com/assets/hero.mp4",
        metadata: { note: "keep-me", contentKind: "image_url" },
      })
      .returning();

    const enabled = await setTranslationKeyTreatAsVideo({
      organizationId: organization.id,
      projectId: project.id,
      translationKeyId: key!.id,
      treatAsVideo: true,
    });
    expect(isOk(enabled)).toBe(true);
    if (isErr(enabled)) {
      throw new Error("expected treat-as-video to succeed");
    }
    expect(enabled.value.metadata).toEqual({ note: "keep-me", contentKind: "video_url" });

    const disabled = await setTranslationKeyTreatAsVideo({
      organizationId: organization.id,
      projectId: project.id,
      translationKeyId: key!.id,
      treatAsVideo: false,
    });
    expect(isOk(disabled)).toBe(true);
    if (isErr(disabled)) {
      throw new Error("expected treat-as-text to succeed");
    }
    expect(disabled.value.metadata).toEqual({ note: "keep-me" });
  });
});

describe("video URL translation approved locks", () => {
  it("does not localize over an approved video URL translation unless forced", async () => {
    const { key, organization, project } = await createApprovedVideoUrlTranslationFixture();

    const result = await localizeVideoUrlTranslation({
      organizationId: organization.id,
      projectId: project.id,
      translationKeyId: key.id,
      targetLocale: "fr-FR",
      sourceLocale: "en-US",
      origin: "https://app.example.com",
    });

    expect(isErr(result)).toBe(true);
    if (isOk(result)) {
      throw new Error("expected approved video URL translation to remain locked");
    }
    expect(result.error).toEqual({ code: "approved_locked" });
    expect(fetchVideoBytesFromUrl).not.toHaveBeenCalled();
    expect(regenerateVideoFromAttachment).not.toHaveBeenCalled();
    expect(createStoredFile).not.toHaveBeenCalled();

    await expect(
      getTranslation({ translationKeyId: key.id, targetLocale: "fr-FR" }),
    ).resolves.toMatchObject({
      text: "https://cdn.example.com/assets/hero-approved-fr.mp4",
      status: "approved",
      metadata: {
        contentKind: "video_url",
        storedFileId: "file_existing",
      },
    });
  });

  it("does not replace approved video URL translation bytes unless forced", async () => {
    const { key, organization, project } = await createApprovedVideoUrlTranslationFixture();

    const result = await replaceVideoUrlTranslationBytes({
      organizationId: organization.id,
      projectId: project.id,
      translationKeyId: key.id,
      targetLocale: "fr-FR",
      origin: "https://app.example.com",
      content: Buffer.from("manual-video"),
      contentType: "video/mp4",
      filename: "hero-fr.mp4",
    });

    expect(isErr(result)).toBe(true);
    if (isOk(result)) {
      throw new Error("expected approved video URL translation to remain locked");
    }
    expect(result.error).toEqual({ code: "approved_locked" });
    expect(createStoredFile).not.toHaveBeenCalled();

    await expect(
      getTranslation({ translationKeyId: key.id, targetLocale: "fr-FR" }),
    ).resolves.toMatchObject({
      text: "https://cdn.example.com/assets/hero-approved-fr.mp4",
      status: "approved",
      metadata: {
        contentKind: "video_url",
        storedFileId: "file_existing",
      },
    });
  });
});
