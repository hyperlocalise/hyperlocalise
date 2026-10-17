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

import { desc, eq } from "drizzle-orm";
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
import { loadProjectXlsxSourceEntries } from "@/lib/projects/files/xlsx-source-entries";
import { upsertProjectTranslationKeysFromEntries } from "@/lib/projects/translations/project-translation-service";
import { multilingualXlsxFixture } from "@/lib/translation/xlsx/xlsx-workbook.fixture";
import { XLSX_CONTENT_TYPE } from "@/lib/translation/xlsx/xlsx-workbook";
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
    await db
      .update(schema.organizationApiKeys)
      .set({ permissions: [...defaultApiKeyPermissions] })
      .where(eq(schema.organizationApiKeys.keyHash, hashApiKey(apiKey)));
    await db
      .update(schema.projects)
      .set({ sourceLocale: "en" })
      .where(eq(schema.projects.id, project.id));
    const sourcePath = "copy/strings.xlsx";
    const storedFile = await createStoredFile({
      organizationId: project.organizationId,
      projectId: project.id,
      role: "source",
      sourceKind: "repository_file",
      filename: "strings.xlsx",
      contentType: XLSX_CONTENT_TYPE,
      content: multilingualXlsxFixture(),
      metadata: { sourcePath },
    });
    const version = await createRepositorySourceFileVersion({ storedFile, sourcePath });
    const entries = await loadProjectXlsxSourceEntries({
      organizationId: project.organizationId,
      projectId: project.id,
      storedFileId: storedFile.id,
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
    const [ctaKey] = await db
      .select({ id: schema.projectTranslationKeys.id })
      .from(schema.projectTranslationKeys)
      .where(eq(schema.projectTranslationKeys.key, "home.cta"))
      .limit(1);
    await db.insert(schema.projectTranslations).values({
      organizationId: project.organizationId,
      projectId: project.id,
      translationKeyId: ctaKey!.id,
      targetLocale: "fr",
      text: "Essai gratuit",
      status: "approved",
      provenance: "import",
    });

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
