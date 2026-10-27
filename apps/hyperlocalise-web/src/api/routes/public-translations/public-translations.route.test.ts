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

import { and, desc, eq } from "drizzle-orm";
import { testClient } from "hono/testing";
import { afterEach, beforeAll, describe, expect, it } from "vite-plus/test";

import { createApp } from "@/api/app";
import type { AppType } from "@/api/typed-app";
import { db, schema } from "@/lib/database/client";
import * as XLSX from "xlsx";

import {
  createRepositorySourceFileVersion,
  createStoredFile,
  ensureRepositorySourceFile,
} from "@/lib/file-storage/records";
import { loadProjectOfficeSourceEntries } from "@/lib/projects/files/office-source-entries";
import { upsertProjectTranslationKeysFromEntries } from "@/lib/projects/translations/project-translation-service";
import { multilingualXlsxFixture } from "@/lib/translation/xlsx/xlsx-workbook.fixture";
import { XLSX_CONTENT_TYPE } from "@/lib/translation/xlsx/xlsx-workbook";
import { DOCX_CONTENT_TYPE, readDocxEntries } from "@/lib/translation/ooxml/docx-document";
import { ooxmlFixture } from "@/lib/translation/ooxml/ooxml.fixture";
import { PPTX_CONTENT_TYPE, readPptxEntries } from "@/lib/translation/ooxml/pptx-deck";
import { defaultApiKeyPermissions } from "@/api/routes/api-key/api-key.schema";

import {
  cleanupPublicApiFixture,
  createPublicApiFixture,
  hashApiKey,
} from "../public-jobs/public-jobs.fixture";

const client = testClient<AppType>(createApp());

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  await cleanupPublicApiFixture();
});

type Project = Awaited<ReturnType<typeof createPublicApiFixture>>["project"];

async function allowAllPermissions(apiKey: string) {
  await db
    .update(schema.organizationApiKeys)
    .set({ permissions: [...defaultApiKeyPermissions] })
    .where(eq(schema.organizationApiKeys.keyHash, hashApiKey(apiKey)));
}

async function seedOfficeSource(input: {
  project: Project;
  sourcePath: string;
  contentType: string;
  content: Uint8Array;
}) {
  const { project } = input;
  await db
    .update(schema.projects)
    .set({ sourceLocale: "en" })
    .where(eq(schema.projects.id, project.id));
  const storedFile = await createStoredFile({
    organizationId: project.organizationId,
    projectId: project.id,
    role: "source",
    sourceKind: "repository_file",
    filename: input.sourcePath.split("/").at(-1)!,
    contentType: input.contentType,
    content: Buffer.from(input.content),
    metadata: { sourcePath: input.sourcePath },
  });
  const version = await createRepositorySourceFileVersion({
    storedFile,
    sourcePath: input.sourcePath,
  });
  const entries = await loadProjectOfficeSourceEntries({
    organizationId: project.organizationId,
    projectId: project.id,
    storedFileId: storedFile.id,
    sourcePath: input.sourcePath,
  });
  if (!entries.ok) {
    throw new Error(`could not read fixture entries: ${entries.error.code}`);
  }
  await upsertProjectTranslationKeysFromEntries({
    organizationId: project.organizationId,
    projectId: project.id,
    repositorySourceFileId: version.repositorySourceFileId,
    entries: entries.value,
  });
}

async function approveTranslation(project: Project, key: string, text: string) {
  const [translationKey] = await db
    .select({ id: schema.projectTranslationKeys.id })
    .from(schema.projectTranslationKeys)
    .where(
      and(
        eq(schema.projectTranslationKeys.projectId, project.id),
        eq(schema.projectTranslationKeys.key, key),
      ),
    )
    .limit(1);
  await db.insert(schema.projectTranslations).values({
    organizationId: project.organizationId,
    projectId: project.id,
    translationKeyId: translationKey!.id,
    targetLocale: "fr",
    text,
    status: "approved",
    provenance: "import",
  });
}

describe("publicTranslationRoutes", () => {
  it("downloads a translation file built from project translations", async () => {
    const { apiKey, project } = await createPublicApiFixture();
    await db
      .update(schema.organizationApiKeys)
      .set({ permissions: [...defaultApiKeyPermissions] })
      .where(eq(schema.organizationApiKeys.keyHash, hashApiKey(apiKey)));
    const sourcePath = "lang/en.json";
    const sourceFile = await ensureRepositorySourceFile({
      organizationId: project.organizationId,
      projectId: project.id,
      sourcePath,
    });

    await upsertProjectTranslationKeysFromEntries({
      organizationId: project.organizationId,
      projectId: project.id,
      repositorySourceFileId: sourceFile.id,
      entries: [{ key: "greeting", text: "Hello", context: null }],
    });

    await db.insert(schema.projectTranslations).values({
      organizationId: project.organizationId,
      projectId: project.id,
      translationKeyId: (
        await db
          .select({ id: schema.projectTranslationKeys.id })
          .from(schema.projectTranslationKeys)
          .where(eq(schema.projectTranslationKeys.repositorySourceFileId, sourceFile.id))
          .limit(1)
      )[0].id,
      targetLocale: "fr",
      text: "Bonjour",
      status: "approved",
      provenance: "import",
    });

    const response = await client.api.v1.projects[":projectId"].translations.download.$get(
      {
        param: { projectId: project.id },
        query: { sourcePath, locale: "fr" },
      },
      { headers: { "x-api-key": apiKey } },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("content-disposition")).toContain("attachment");
    const content = await response.text();
    expect(JSON.parse(content)).toEqual({ greeting: "Bonjour" });
  });

  it("writes ready translations into the target column of an Excel source", async () => {
    const { apiKey, project } = await createPublicApiFixture();
    await allowAllPermissions(apiKey);
    const sourcePath = "copy/strings.xlsx";
    await seedOfficeSource({
      project,
      sourcePath,
      contentType: XLSX_CONTENT_TYPE,
      content: multilingualXlsxFixture(),
    });
    await approveTranslation(project, "home.cta", "Essai gratuit");

    const response = await client.api.v1.projects[":projectId"].translations.download.$get(
      { param: { projectId: project.id }, query: { sourcePath, locale: "fr" } },
      { headers: { "x-api-key": apiKey } },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(XLSX_CONTENT_TYPE);
    expect(response.headers.get("content-disposition")).toContain("strings-fr.xlsx");
    const sheet = XLSX.read(new Uint8Array(await response.arrayBuffer()), { type: "array" }).Sheets
      .Strings!;
    // The fixture's French "Accueil" has no ready translation, so it is cleared.
    expect(sheet.B2?.v).toBeUndefined();
    expect(sheet.B3?.v).toBe("Essai gratuit");
    expect(sheet.B4).toBeUndefined();
    expect(sheet.D3?.v).toBe("Start free trial");
  });

  it("generates legacy .xls sources as .xlsx workbooks", async () => {
    const { apiKey, project } = await createPublicApiFixture();
    await allowAllPermissions(apiKey);
    const sourcePath = "copy/legacy.xls";
    const workbook = XLSX.read(multilingualXlsxFixture(), { type: "array" });
    await seedOfficeSource({
      project,
      sourcePath,
      contentType: "application/vnd.ms-excel",
      content: Buffer.from(
        XLSX.write(workbook, { type: "array", bookType: "biff8" }) as ArrayBuffer,
      ),
    });
    await approveTranslation(project, "home.cta", "Essai gratuit");

    const response = await client.api.v1.projects[":projectId"].translations.download.$get(
      { param: { projectId: project.id }, query: { sourcePath, locale: "fr" } },
      { headers: { "x-api-key": apiKey } },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(XLSX_CONTENT_TYPE);
    expect(response.headers.get("content-disposition")).toContain("legacy-fr.xlsx");
    const sheet = XLSX.read(new Uint8Array(await response.arrayBuffer()), { type: "array" }).Sheets
      .Strings!;
    expect(sheet.B3?.v).toBe("Essai gratuit");
  });

  it("writes ready translations into the paragraphs of a Word source", async () => {
    const { apiKey, project } = await createPublicApiFixture();
    await allowAllPermissions(apiKey);
    const sourcePath = "docs/report.docx";
    await seedOfficeSource({
      project,
      sourcePath,
      contentType: DOCX_CONTENT_TYPE,
      content: Buffer.from(await ooxmlFixture("docx-basic")),
    });
    await approveTranslation(project, "word/document.xml#0", "Rapport trimestriel");

    const response = await client.api.v1.projects[":projectId"].translations.download.$get(
      { param: { projectId: project.id }, query: { sourcePath, locale: "fr" } },
      { headers: { "x-api-key": apiKey } },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(DOCX_CONTENT_TYPE);
    expect(response.headers.get("content-disposition")).toContain("report-fr.docx");
    const entries = await readDocxEntries(new Uint8Array(await response.arrayBuffer()));
    if (!entries.ok) throw new Error(entries.error.code);
    expect(entries.value.find((entry) => entry.key === "word/document.xml#0")?.text).toBe(
      "Rapport trimestriel",
    );
    expect(entries.value.find((entry) => entry.key === "word/document.xml#5")?.text).toBe(
      "Cell text",
    );
  });

  it("writes ready translations into the paragraphs of a PowerPoint source", async () => {
    const { apiKey, project } = await createPublicApiFixture();
    await allowAllPermissions(apiKey);
    const sourcePath = "slides/deck.pptx";
    await seedOfficeSource({
      project,
      sourcePath,
      contentType: PPTX_CONTENT_TYPE,
      content: Buffer.from(await ooxmlFixture("pptx-basic")),
    });
    await approveTranslation(project, "ppt/slides/slide2.xml#0", "Bienvenue");

    const response = await client.api.v1.projects[":projectId"].translations.download.$get(
      { param: { projectId: project.id }, query: { sourcePath, locale: "fr" } },
      { headers: { "x-api-key": apiKey } },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(PPTX_CONTENT_TYPE);
    expect(response.headers.get("content-disposition")).toContain("deck-fr.pptx");
    const entries = await readPptxEntries(new Uint8Array(await response.arrayBuffer()));
    if (!entries.ok) throw new Error(entries.error.code);
    expect(entries.value.find((entry) => entry.key === "ppt/slides/slide2.xml#0")?.text).toBe(
      "Bienvenue",
    );
    expect(entries.value.find((entry) => entry.key === "ppt/slides/slide1.xml#0")?.text).toBe(
      "Price & plan",
    );
  });

  it("downloads large source files across paginated key fetches", async () => {
    const { apiKey, project } = await createPublicApiFixture();
    await db
      .update(schema.organizationApiKeys)
      .set({ permissions: [...defaultApiKeyPermissions] })
      .where(eq(schema.organizationApiKeys.keyHash, hashApiKey(apiKey)));
    const sourcePath = "lang/en-large.json";
    const sourceFile = await ensureRepositorySourceFile({
      organizationId: project.organizationId,
      projectId: project.id,
      sourcePath,
    });

    const keys = Array.from({ length: 5_001 }, (_, index) => ({
      organizationId: project.organizationId,
      projectId: project.id,
      repositorySourceFileId: sourceFile.id,
      key: `entry_${index}`,
      sourceText: `Hello ${index}`,
      normalizedSourceText: `hello ${index}`,
    }));

    for (let offset = 0; offset < keys.length; offset += 1_000) {
      await db.insert(schema.projectTranslationKeys).values(keys.slice(offset, offset + 1_000));
    }

    const response = await client.api.v1.projects[":projectId"].translations.download.$get(
      {
        param: { projectId: project.id },
        query: { sourcePath, locale: "fr" },
      },
      { headers: { "x-api-key": apiKey } },
    );

    expect(response.status).toBe(200);
    const content = await response.text();
    const parsed = JSON.parse(content) as Record<string, string>;
    expect(Object.keys(parsed)).toHaveLength(5_001);
    expect(parsed.entry_0).toBe("Hello 0");
    expect(parsed.entry_5000).toBe("Hello 5000");
  });

  it("returns 404 when the source path is not registered in the project", async () => {
    const { apiKey, project } = await createPublicApiFixture();
    await db
      .update(schema.organizationApiKeys)
      .set({ permissions: [...defaultApiKeyPermissions] })
      .where(eq(schema.organizationApiKeys.keyHash, hashApiKey(apiKey)));

    const response = await client.api.v1.projects[":projectId"].translations.download.$get(
      {
        param: { projectId: project.id },
        query: { sourcePath: "lang/missing.json", locale: "fr" },
      },
      { headers: { "x-api-key": apiKey } },
    );

    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("source_file_not_found");
  });

  it("downloads source fallbacks when source keys exist but no translations are ready", async () => {
    const { apiKey, project } = await createPublicApiFixture();
    await db
      .update(schema.organizationApiKeys)
      .set({ permissions: [...defaultApiKeyPermissions] })
      .where(eq(schema.organizationApiKeys.keyHash, hashApiKey(apiKey)));
    const sourcePath = "lang/en-pending.json";
    const sourceFile = await ensureRepositorySourceFile({
      organizationId: project.organizationId,
      projectId: project.id,
      sourcePath,
    });

    await upsertProjectTranslationKeysFromEntries({
      organizationId: project.organizationId,
      projectId: project.id,
      repositorySourceFileId: sourceFile.id,
      entries: [{ key: "greeting", text: "Hello", context: null }],
    });

    const response = await client.api.v1.projects[":projectId"].translations.download.$get(
      {
        param: { projectId: project.id },
        query: { sourcePath, locale: "fr" },
      },
      { headers: { "x-api-key": apiKey } },
    );

    expect(response.status).toBe(200);
    const content = await response.text();
    expect(JSON.parse(content)).toEqual({ greeting: "Hello" });
  });

  it("exports every source key while preserving translated values", async () => {
    const { apiKey, project } = await createPublicApiFixture();
    await db
      .update(schema.organizationApiKeys)
      .set({ permissions: [...defaultApiKeyPermissions] })
      .where(eq(schema.organizationApiKeys.keyHash, hashApiKey(apiKey)));
    const sourcePath = "lang/en-partial.json";
    const sourceFile = await ensureRepositorySourceFile({
      organizationId: project.organizationId,
      projectId: project.id,
      sourcePath,
    });

    await upsertProjectTranslationKeysFromEntries({
      organizationId: project.organizationId,
      projectId: project.id,
      repositorySourceFileId: sourceFile.id,
      entries: [
        { key: "greeting", text: "Hello", context: null },
        { key: "farewell", text: "Goodbye", context: null },
      ],
    });

    const [translationKey] = await db
      .select({ id: schema.projectTranslationKeys.id })
      .from(schema.projectTranslationKeys)
      .where(eq(schema.projectTranslationKeys.repositorySourceFileId, sourceFile.id))
      .orderBy(desc(schema.projectTranslationKeys.key))
      .limit(1);

    await db.insert(schema.projectTranslations).values({
      organizationId: project.organizationId,
      projectId: project.id,
      translationKeyId: translationKey.id,
      targetLocale: "fr",
      text: "Bonjour",
      status: "approved",
      provenance: "import",
    });

    const response = await client.api.v1.projects[":projectId"].translations.download.$get(
      {
        param: { projectId: project.id },
        query: { sourcePath, locale: "fr" },
      },
      { headers: { "x-api-key": apiKey } },
    );

    expect(response.status).toBe(200);
    const content = await response.text();
    expect(JSON.parse(content)).toEqual({
      greeting: "Bonjour",
      farewell: "Goodbye",
    });
  });

  it("rejects translation downloads without files:read", async () => {
    const { apiKey, project } = await createPublicApiFixture();
    await db
      .update(schema.organizationApiKeys)
      .set({ permissions: ["jobs:read", "jobs:write"] })
      .where(eq(schema.organizationApiKeys.keyHash, hashApiKey(apiKey)));

    const response = await client.api.v1.projects[":projectId"].translations.download.$get(
      {
        param: { projectId: project.id },
        query: { sourcePath: "lang/en.json", locale: "fr" },
      },
      { headers: { "x-api-key": apiKey } },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: "forbidden" });
  });
});
