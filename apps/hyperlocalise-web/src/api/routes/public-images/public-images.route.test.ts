import "dotenv/config";

import { eq } from "drizzle-orm";
import { testClient } from "hono/testing";
import { afterEach, beforeAll, describe, expect, it } from "vite-plus/test";

import { createApp } from "@/api/app";
import { defaultApiKeyPermissions } from "@/api/routes/api-key/api-key.schema";
import { db, schema } from "@/lib/database";
import { createStoredFile } from "@/lib/file-storage/records";
import { createMemoryFileStorageAdapter } from "../file/file.fixture";
import {
  cleanupPublicApiFixture,
  createPublicApiFixture,
  hashApiKey,
} from "../public-jobs/public-jobs.fixture";

const fileStorageAdapter = createMemoryFileStorageAdapter();
const client = testClient(createApp({ fileStorageAdapter }));

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  await cleanupPublicApiFixture();
});

describe("publicImageRoutes", () => {
  it("downloads raw image variant bytes for sync pull", async () => {
    const { apiKey, project } = await createPublicApiFixture();
    await db
      .update(schema.organizationApiKeys)
      .set({ permissions: [...defaultApiKeyPermissions] })
      .where(eq(schema.organizationApiKeys.keyHash, hashApiKey(apiKey)));

    const sourcePath = "assets/banner.png";
    const imageBytes = Buffer.from("localized-image-bytes");
    const storedFile = await createStoredFile({
      organizationId: project.organizationId,
      projectId: project.id,
      role: "output",
      sourceKind: "job_output",
      filename: "banner-fr.png",
      contentType: "image/png",
      content: imageBytes,
      adapter: fileStorageAdapter,
    });

    await db.insert(schema.projectImageVariants).values({
      organizationId: project.organizationId,
      projectId: project.id,
      sourcePath,
      targetLocale: "fr",
      storedFileId: storedFile.id,
      status: "approved",
      provenance: "import",
    });

    const response = await client.api.v1.projects[":projectId"].images.download.$get(
      {
        param: { projectId: project.id },
        query: { sourcePath, locale: "fr" },
      },
      { headers: { "x-api-key": apiKey } },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("content-disposition")).toContain("attachment");
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe("localized-image-bytes");
  });

  it("returns 404 when the image variant is missing", async () => {
    const { apiKey, project } = await createPublicApiFixture();
    await db
      .update(schema.organizationApiKeys)
      .set({ permissions: [...defaultApiKeyPermissions] })
      .where(eq(schema.organizationApiKeys.keyHash, hashApiKey(apiKey)));

    const response = await client.api.v1.projects[":projectId"].images.download.$get(
      {
        param: { projectId: project.id },
        query: { sourcePath: "assets/missing.png", locale: "fr" },
      },
      { headers: { "x-api-key": apiKey } },
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body).toMatchObject({ error: "image_variant_not_found" });
  });
});
