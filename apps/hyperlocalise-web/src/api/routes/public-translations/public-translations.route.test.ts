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
  it("lists and upserts project translations for key sync", async () => {
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
      entries: [{ key: "greeting", text: "Hello" }],
    });

    const putResponse = await client.api.v1.projects[":projectId"].translations.$put(
      {
        param: { projectId: project.id },
        json: {
          sourcePath,
          sourceLocale: "en",
          entries: [{ key: "greeting", locale: "fr", value: "Bonjour" }],
        },
      },
      { headers: { "x-api-key": apiKey } },
    );

    expect(putResponse.status).toBe(200);

    const getResponse = await client.api.v1.projects[":projectId"].translations.$get(
      {
        param: { projectId: project.id },
        query: { sourcePath, locales: "fr" },
      },
      { headers: { "x-api-key": apiKey } },
    );

    expect(getResponse.status).toBe(200);
    const body = (await getResponse.json()) as {
      translations: Array<{ key: string; locale: string; value: string }>;
    };
    expect(body.translations).toEqual([
      expect.objectContaining({ key: "greeting", locale: "fr", value: "Bonjour" }),
    ]);
  });
});
