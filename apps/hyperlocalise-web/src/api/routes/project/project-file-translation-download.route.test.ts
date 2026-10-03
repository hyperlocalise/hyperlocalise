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

import { eq } from "drizzle-orm";
import { testClient } from "hono/testing";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { createApp } from "@/api/app";
import type { AppType } from "@/api/typed-app";
import { db, schema } from "@/lib/database/client";
import { createStoredFile, ensureRepositorySourceFile } from "@/lib/file-storage/records";
import { upsertProjectTranslationKeysFromEntries } from "@/lib/projects/translations/project-translation-service";

import { createMemoryFileStorageAdapter } from "../file/file.fixture";
import { createProjectTestFixture } from "./project.fixture";

const { resolveApiAuthContextFromSessionMock } = vi.hoisted(() => ({
  resolveApiAuthContextFromSessionMock: vi.fn(
    (options) =>
      globalThis.__resolveTestApiAuthContextFromSession?.(options) ??
      globalThis.__testApiAuthContext ??
      null,
  ),
}));

vi.mock("@/api/auth/workos-session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/auth/workos-session")>();
  return {
    ...actual,
    resolveApiAuthContextFromSession: resolveApiAuthContextFromSessionMock,
  };
});

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const LOCALE = "fr-FR";

const fileStorageAdapter = createMemoryFileStorageAdapter();
const app = createApp({ fileStorageAdapter });
const client = testClient<AppType>(app);
const { authHeadersFor, cleanup, createStoredProjectFixture } = createProjectTestFixture(client);

async function sourceFileFixture(sourcePath: string) {
  const fixture = await createStoredProjectFixture();
  const sourceFile = await ensureRepositorySourceFile({
    organizationId: fixture.organization.id,
    projectId: fixture.project.id,
    sourcePath,
  });
  const headers = await authHeadersFor(fixture.identity);
  const query = new URLSearchParams({ sourcePath, locale: LOCALE });

  return {
    ...fixture,
    sourceFile,
    download: () =>
      app.request(
        `/api/orgs/${fixture.identity.organization.slug}/projects/${fixture.project.id}/files/translations/download?${query}`,
        { headers },
      ),
  };
}

type SourceFileFixture = Awaited<ReturnType<typeof sourceFileFixture>>;

function storeVariantFile(
  fixture: SourceFileFixture,
  file: { filename: string; contentType: string; content: string },
) {
  return createStoredFile({
    organizationId: fixture.organization.id,
    projectId: fixture.project.id,
    createdByUserId: fixture.user.id,
    role: "asset",
    sourceKind: "chat_upload",
    filename: file.filename,
    contentType: file.contentType,
    content: Buffer.from(file.content),
    adapter: fileStorageAdapter,
  });
}

/** Images, documents, and office files keep their translated file in the same table. */
async function saveFileVariant(
  fixture: SourceFileFixture,
  sourcePath: string,
  file: { filename: string; contentType: string; content: string },
) {
  const stored = await storeVariantFile(fixture, file);
  await db.insert(schema.projectImageVariants).values({
    organizationId: fixture.organization.id,
    projectId: fixture.project.id,
    repositorySourceFileId: fixture.sourceFile.id,
    sourcePath,
    targetLocale: LOCALE,
    storedFileId: stored.id,
    status: "needs_review",
  });
}

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  vi.clearAllMocks();
  await cleanup();
});

describe("project file translation download route", () => {
  it("downloads the translated file saved for a workbook before it is approved", async () => {
    const fixture = await sourceFileFixture("finance/Tracker.xlsx");
    await saveFileVariant(fixture, "finance/Tracker.xlsx", {
      filename: "Tracker.xlsx",
      contentType: XLSX_TYPE,
      content: "translated-workbook",
    });

    const response = await fixture.download();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(XLSX_TYPE);
    expect(response.headers.get("content-disposition")).toBe(
      "attachment; filename*=UTF-8''Tracker-fr-FR.xlsx",
    );
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe("translated-workbook");
  });

  it.each([
    {
      kind: "image",
      sourcePath: "assets/banner.png",
      file: { filename: "Untitled.png", contentType: "image/png", content: "translated-image" },
      downloadName: "banner-fr-FR.png",
    },
    {
      kind: "document",
      sourcePath: "docs/intro.md",
      file: { filename: "intro.md", contentType: "text/markdown", content: "# Bonjour\n" },
      downloadName: "intro-fr-FR.md",
    },
  ])(
    "downloads the translated file saved for a $kind",
    async ({ sourcePath, file, downloadName }) => {
      const fixture = await sourceFileFixture(sourcePath);
      await saveFileVariant(fixture, sourcePath, file);

      const response = await fixture.download();

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe(file.contentType);
      expect(response.headers.get("content-disposition")).toContain(downloadName);
      expect(Buffer.from(await response.arrayBuffer()).toString()).toBe(file.content);
    },
  );

  it("downloads the translated file saved for a video", async () => {
    const fixture = await sourceFileFixture("media/demo.mp4");
    const stored = await storeVariantFile(fixture, {
      filename: "demo-fr-FR.mp4",
      contentType: "video/mp4",
      content: "translated-video",
    });
    await db.insert(schema.projectVideoVariants).values({
      organizationId: fixture.organization.id,
      projectId: fixture.project.id,
      repositorySourceFileId: fixture.sourceFile.id,
      sourcePath: "media/demo.mp4",
      targetLocale: LOCALE,
      storedFileId: stored.id,
      status: "needs_review",
    });

    const response = await fixture.download();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("video/mp4");
    expect(response.headers.get("content-disposition")).toContain("demo-fr-FR.mp4");
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe("translated-video");
  });

  it("names the download by the saved file's type when it differs from the source's", async () => {
    const fixture = await sourceFileFixture("finance/rates.xls");
    await saveFileVariant(fixture, "finance/rates.xls", {
      filename: "rates.xlsx",
      contentType: XLSX_TYPE,
      content: "translated-workbook",
    });

    const response = await fixture.download();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toBe(
      "attachment; filename*=UTF-8''rates-fr-FR.xlsx",
    );
  });

  it("reports that no translated file has been saved for the locale", async () => {
    const fixture = await sourceFileFixture("assets/banner.png");
    // Uploading an image creates one empty entry per target locale.
    await db.insert(schema.projectImageVariants).values({
      organizationId: fixture.organization.id,
      projectId: fixture.project.id,
      repositorySourceFileId: fixture.sourceFile.id,
      sourcePath: "assets/banner.png",
      targetLocale: LOCALE,
    });

    const response = await fixture.download();

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "file_variant_not_found",
      message: "No translated file has been saved for this source file and locale.",
    });
  });

  it("downloads string translations as a JSON file", async () => {
    const fixture = await sourceFileFixture("lang/en.json");
    await upsertProjectTranslationKeysFromEntries({
      organizationId: fixture.organization.id,
      projectId: fixture.project.id,
      repositorySourceFileId: fixture.sourceFile.id,
      entries: [{ key: "greeting", text: "Hello", context: null }],
    });
    const [key] = await db
      .select({ id: schema.projectTranslationKeys.id })
      .from(schema.projectTranslationKeys)
      .where(eq(schema.projectTranslationKeys.repositorySourceFileId, fixture.sourceFile.id));
    await db.insert(schema.projectTranslations).values({
      organizationId: fixture.organization.id,
      projectId: fixture.project.id,
      translationKeyId: key.id,
      targetLocale: LOCALE,
      text: "Bonjour",
      status: "approved",
      provenance: "import",
    });

    const response = await fixture.download();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("content-disposition")).toContain("en-fr-FR.json");
    expect(JSON.parse(await response.text())).toEqual({ greeting: "Bonjour" });
  });
});
