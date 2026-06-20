import "dotenv/config";

import { eq } from "drizzle-orm";
import { testClient } from "hono/testing";
import { afterEach, beforeAll, describe, expect, it } from "vite-plus/test";

import { createApp } from "@/api/app";
import { db, schema } from "@/lib/database";
import { ensureRepositorySourceFile } from "@/lib/file-storage/records";
import { upsertProjectTranslationKeysFromEntries } from "@/lib/projects/translations/project-translation-service";
import { defaultApiKeyPermissions } from "@/api/routes/api-key/api-key.schema";

import {
  cleanupPublicApiFixture,
  createPublicApiFixture,
  hashApiKey,
} from "../public-jobs/public-jobs.fixture";

const client = testClient(createApp());

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
});
