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
import { testClient } from "hono/testing";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";
import * as XLSX from "xlsx";

import { createApp } from "@/api/app";
import type { AppType } from "@/api/typed-app";
import { db, schema } from "@/lib/database/client";
import {
  createRepositorySourceFileVersion,
  createStoredFile,
  ensureRepositorySourceFile,
} from "@/lib/file-storage/records";
import { GoSvcClientError } from "@/lib/go-svc/go-svc-client";
import { loadProjectOfficeSourceEntries } from "@/lib/projects/files/office-source-entries";
import { upsertProjectTranslationKeysFromEntries } from "@/lib/projects/translations/project-translation-service";
import { multilingualXlsxFixture } from "@/lib/translation/xlsx/xlsx-workbook.fixture";
import { XLSX_CONTENT_TYPE } from "@/lib/translation/xlsx/xlsx-workbook";

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

const { renderTranslationFileMock } = vi.hoisted(() => ({
  renderTranslationFileMock: vi.fn(),
}));

vi.mock("@/lib/go-svc/go-svc-server-client", () => ({
  createGoSvcServerClient: () => ({ translationFile: { render: renderTranslationFileMock } }),
}));

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

  return {
    ...fixture,
    sourceFile,
    download: () =>
      client.api.orgs[":organizationSlug"].projects[":projectId"].files.translations.download.$get(
        {
          param: {
            organizationSlug: fixture.identity.organization.slug ?? "missing-slug",
            projectId: fixture.project.id,
          },
          query: { sourcePath, locale: LOCALE },
        },
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

/** Stores a version of the source file and returns its row. */
async function storeSourceVersion(
  fixture: SourceFileFixture,
  sourcePath: string,
  file: { contentType: string; content: string },
) {
  const stored = await createStoredFile({
    organizationId: fixture.organization.id,
    projectId: fixture.project.id,
    createdByUserId: fixture.user.id,
    role: "source",
    sourceKind: "repository_file",
    filename: sourcePath.split("/").pop() ?? sourcePath,
    contentType: file.contentType,
    content: Buffer.from(file.content),
    adapter: fileStorageAdapter,
  });
  return createRepositorySourceFileVersion({ storedFile: stored, sourcePath });
}

async function saveStringKeys(
  fixture: SourceFileFixture,
  entries: Array<{ key: string; text: string; translation?: string }>,
) {
  await upsertProjectTranslationKeysFromEntries({
    organizationId: fixture.organization.id,
    projectId: fixture.project.id,
    repositorySourceFileId: fixture.sourceFile.id,
    entries: entries.map(({ key, text }) => ({ key, text, context: null })),
  });
  const keys = await db
    .select({ id: schema.projectTranslationKeys.id, key: schema.projectTranslationKeys.key })
    .from(schema.projectTranslationKeys)
    .where(eq(schema.projectTranslationKeys.repositorySourceFileId, fixture.sourceFile.id));
  const translated = entries.filter((entry) => entry.translation !== undefined);
  if (translated.length === 0) {
    return;
  }
  await db.insert(schema.projectTranslations).values(
    translated.map((entry) => ({
      organizationId: fixture.organization.id,
      projectId: fixture.project.id,
      translationKeyId: keys.find((key) => key.key === entry.key)!.id,
      targetLocale: LOCALE,
      text: entry.translation!,
      status: "approved" as const,
      provenance: "import" as const,
    })),
  );
}

function renderedFile(content: string) {
  return {
    blob: new Blob([content]),
    contentType: "application/octet-stream",
    filename: null,
    extension: null,
    warningCount: 0,
  };
}

function expectJsonDownload(response: Response) {
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("application/json");
  expect(response.headers.get("content-disposition")).toBe(
    "attachment; filename*=UTF-8''messages-fr-FR.json",
  );
}

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  vi.clearAllMocks();
  renderTranslationFileMock.mockReset();
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
    expect(renderTranslationFileMock).not.toHaveBeenCalled();
  });

  it("downloads string translations of a CSV file as a CSV file", async () => {
    const source = "key,value\ngreeting,Hello\nfarewell,Goodbye\n";
    const fixture = await sourceFileFixture("locales/messages.csv");
    await storeSourceVersion(fixture, "locales/messages.csv", {
      contentType: "text/csv",
      content: source,
    });
    await saveStringKeys(fixture, [
      { key: "greeting", text: "Hello", translation: "Bonjour" },
      { key: "farewell", text: "Goodbye" },
    ]);
    renderTranslationFileMock.mockResolvedValue(
      renderedFile("key,value\ngreeting,Bonjour\nfarewell,Goodbye\n"),
    );

    const response = await fixture.download();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/csv");
    expect(response.headers.get("content-disposition")).toBe(
      "attachment; filename*=UTF-8''messages-fr-FR.csv",
    );
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await response.text()).toBe("key,value\ngreeting,Bonjour\nfarewell,Goodbye\n");
    // Untranslated keys are left out so the writer keeps what the source has for them.
    expect(renderTranslationFileMock).toHaveBeenCalledWith(
      {
        source: Buffer.from(source),
        request: {
          sourcePath: "locales/messages.csv",
          sourceLocale: "en-US",
          targetLocale: LOCALE,
          values: { greeting: "Bonjour" },
          sourceSpans: {},
        },
      },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("leaves subtitle downloads to the subtitle writer", async () => {
    const source = "1\n00:00:01,000 --> 00:00:02,000\nHello\n";
    const fixture = await sourceFileFixture("media/intro.srt");
    await storeSourceVersion(fixture, "media/intro.srt", {
      contentType: "application/x-subrip",
      content: source,
    });
    await saveStringKeys(fixture, [{ key: "srt.0001", text: "Hello", translation: "Bonjour" }]);

    const response = await fixture.download();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/x-subrip");
    expect(await response.text()).toBe("1\n00:00:01,000 --> 00:00:02,000\nBonjour\n");
    expect(renderTranslationFileMock).not.toHaveBeenCalled();
  });

  it("names a filled-in gettext template as a catalog", async () => {
    const fixture = await sourceFileFixture("locales/messages.pot");
    await storeSourceVersion(fixture, "locales/messages.pot", {
      contentType: "text/x-gettext-translation-template",
      content: 'msgid "Hello"\nmsgstr ""\n',
    });
    await saveStringKeys(fixture, [{ key: "Hello", text: "Hello", translation: "Bonjour" }]);
    renderTranslationFileMock.mockResolvedValue(renderedFile('msgid "Hello"\nmsgstr "Bonjour"\n'));

    const response = await fixture.download();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toBe(
      "attachment; filename*=UTF-8''messages-fr-FR.po",
    );
  });

  it("writes a YAML download from the source version its strings were read from", async () => {
    const fixture = await sourceFileFixture("locales/messages.yml");
    const ingested = await storeSourceVersion(fixture, "locales/messages.yml", {
      contentType: "application/yaml",
      content: "title: Hello\n",
    });
    await db
      .update(schema.repositorySourceFiles)
      .set({ reconciledSourceFileVersionId: ingested.id })
      .where(eq(schema.repositorySourceFiles.id, fixture.sourceFile.id));
    await storeSourceVersion(fixture, "locales/messages.yml", {
      contentType: "application/yaml",
      content: "title: Hello again\n",
    });
    await saveStringKeys(fixture, [{ key: "title", text: "Hello", translation: "Bonjour" }]);
    renderTranslationFileMock.mockResolvedValue(renderedFile("title: Bonjour\n"));

    const response = await fixture.download();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/yaml");
    expect(response.headers.get("content-disposition")).toContain("messages-fr-FR.yml");
    expect(response.headers.get("content-security-policy")).toBe("default-src 'none'; sandbox;");
    expect(await response.text()).toBe("title: Bonjour\n");
    expect(renderTranslationFileMock.mock.calls[0]?.[0]).toMatchObject({
      source: Buffer.from("title: Hello\n"),
    });
  });

  it("sends the source text of every sentence of a segmented string", async () => {
    const fixture = await sourceFileFixture("locales/messages.csv");
    await storeSourceVersion(fixture, "locales/messages.csv", {
      contentType: "text/csv",
      content: "key,value\nintro,Hello. World.\ntitle,Home\n",
    });
    await saveStringKeys(fixture, [
      { key: "intro#srx.0", text: "Hello.", translation: "Bonjour." },
      { key: "intro#srx.1", text: " World." },
      { key: "title", text: "Home", translation: "Accueil" },
    ]);
    renderTranslationFileMock.mockResolvedValue(renderedFile("rendered"));

    const response = await fixture.download();

    expect(response.status).toBe(200);
    expect(renderTranslationFileMock.mock.calls[0]?.[0]).toMatchObject({
      request: {
        values: { "intro#srx.0": "Bonjour.", title: "Accueil" },
        sourceSpans: { "intro#srx.0": "Hello.", "intro#srx.1": " World." },
      },
    });
  });

  it("reports a string file that has no strings", async () => {
    const fixture = await sourceFileFixture("locales/messages.csv");
    await storeSourceVersion(fixture, "locales/messages.csv", {
      contentType: "text/csv",
      content: "key,value\n",
    });

    const response = await fixture.download();

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: "translations_not_found" });
    expect(renderTranslationFileMock).not.toHaveBeenCalled();
  });

  it.each([
    {
      failure: "the file writer cannot be reached",
      error: new GoSvcClientError({ code: "network_error", message: "Unable to reach go-svc" }),
    },
    {
      failure: "the file writer does not have its route yet",
      error: new GoSvcClientError({ code: "not_found", message: "not found", status: 404 }),
    },
    {
      failure: "the file writer rejects the source file",
      error: new GoSvcClientError({ code: "render_failed", message: "rejected", status: 422 }),
    },
    {
      failure: "the file writer refuses the source file's size",
      error: new GoSvcClientError({ code: "payload_too_large", message: "too large", status: 413 }),
    },
  ])("downloads JSON, named as JSON, when $failure", async ({ error }) => {
    const fixture = await sourceFileFixture("locales/messages.csv");
    await storeSourceVersion(fixture, "locales/messages.csv", {
      contentType: "text/csv",
      content: "key,value\ngreeting,Hello\n",
    });
    await saveStringKeys(fixture, [{ key: "greeting", text: "Hello", translation: "Bonjour" }]);
    renderTranslationFileMock.mockRejectedValue(error);

    const response = await fixture.download();

    expectJsonDownload(response);
    expect(JSON.parse(await response.text())).toEqual({ greeting: "Bonjour" });
  });

  it("downloads JSON without calling the file writer for a source over its limit", async () => {
    const fixture = await sourceFileFixture("locales/messages.csv");
    await storeSourceVersion(fixture, "locales/messages.csv", {
      contentType: "text/csv",
      content: `key,value\ngreeting,Hello\n${"#".repeat(25 * 1024 * 1024)}\n`,
    });
    await saveStringKeys(fixture, [{ key: "greeting", text: "Hello", translation: "Bonjour" }]);

    const response = await fixture.download();

    expectJsonDownload(response);
    expect(JSON.parse(await response.text())).toEqual({ greeting: "Bonjour" });
    expect(renderTranslationFileMock).not.toHaveBeenCalled();
  });

  it("downloads JSON when the source file's content is not stored", async () => {
    const fixture = await sourceFileFixture("locales/messages.csv");
    await saveStringKeys(fixture, [{ key: "greeting", text: "Hello", translation: "Bonjour" }]);

    const response = await fixture.download();

    expectJsonDownload(response);
    expect(JSON.parse(await response.text())).toEqual({ greeting: "Bonjour" });
    expect(renderTranslationFileMock).not.toHaveBeenCalled();
  });

  it("generates a segmented Excel download when no translated workbook has been saved", async () => {
    const sourcePath = "copy/strings.xlsx";
    const fixture = await sourceFileFixture(sourcePath);
    const storedFile = await createStoredFile({
      organizationId: fixture.organization.id,
      projectId: fixture.project.id,
      role: "source",
      sourceKind: "repository_file",
      filename: "strings.xlsx",
      contentType: XLSX_CONTENT_TYPE,
      content: Buffer.from(multilingualXlsxFixture()),
      metadata: { sourcePath },
    });
    await createRepositorySourceFileVersion({ storedFile, sourcePath });
    const entries = await loadProjectOfficeSourceEntries({
      organizationId: fixture.organization.id,
      projectId: fixture.project.id,
      storedFileId: storedFile.id,
      sourcePath,
    });
    if (!entries.ok) {
      throw new Error(`could not read fixture entries: ${entries.error.code}`);
    }
    await upsertProjectTranslationKeysFromEntries({
      organizationId: fixture.organization.id,
      projectId: fixture.project.id,
      repositorySourceFileId: fixture.sourceFile.id,
      entries: entries.value,
    });
    const [key] = await db
      .select({ id: schema.projectTranslationKeys.id })
      .from(schema.projectTranslationKeys)
      .where(
        and(
          eq(schema.projectTranslationKeys.repositorySourceFileId, fixture.sourceFile.id),
          eq(schema.projectTranslationKeys.key, "home.cta"),
        ),
      );
    await db.insert(schema.projectTranslations).values({
      organizationId: fixture.organization.id,
      projectId: fixture.project.id,
      translationKeyId: key.id,
      targetLocale: LOCALE,
      text: "Essai gratuit",
      status: "approved",
      provenance: "import",
    });

    const response = await fixture.download();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(XLSX_CONTENT_TYPE);
    expect(response.headers.get("content-disposition")).toContain("strings-fr-FR.xlsx");
    const sheet = XLSX.read(new Uint8Array(await response.arrayBuffer()), { type: "array" }).Sheets
      .Strings!;
    expect(sheet.B3?.v).toBe("Essai gratuit");
    expect(sheet.D3?.v).toBe("Start free trial");
  });
});
