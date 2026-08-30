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
import { afterEach, beforeAll, describe, expect, it } from "vite-plus/test";

import { createApp } from "@/api/app";
import { defaultApiKeyPermissions } from "@/api/routes/api-key/api-key.schema";
import { db, schema } from "@/lib/database/client";
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

  it("downloads stored file variant bytes from files/download", async () => {
    const { apiKey, project } = await createPublicApiFixture();
    await db
      .update(schema.organizationApiKeys)
      .set({ permissions: [...defaultApiKeyPermissions] })
      .where(eq(schema.organizationApiKeys.keyHash, hashApiKey(apiKey)));

    const sourcePath = "docs/intro.md";
    const markdownBytes = Buffer.from("# Bonjour\n");
    const storedFile = await createStoredFile({
      organizationId: project.organizationId,
      projectId: project.id,
      role: "output",
      sourceKind: "job_output",
      filename: "intro-fr.md",
      contentType: "text/markdown",
      content: markdownBytes,
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

    const response = await client.api.v1.projects[":projectId"].files.download.$get(
      {
        param: { projectId: project.id },
        query: { sourcePath, locale: "fr" },
      },
      { headers: { "x-api-key": apiKey } },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/markdown");
    expect(response.headers.get("content-disposition")).toContain("intro-fr.md");
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe("# Bonjour\n");
  });

  it("returns 404 when the file variant is missing", async () => {
    const { apiKey, project } = await createPublicApiFixture();
    await db
      .update(schema.organizationApiKeys)
      .set({ permissions: [...defaultApiKeyPermissions] })
      .where(eq(schema.organizationApiKeys.keyHash, hashApiKey(apiKey)));

    const response = await client.api.v1.projects[":projectId"].files.download.$get(
      {
        param: { projectId: project.id },
        query: { sourcePath: "docs/missing.md", locale: "fr" },
      },
      { headers: { "x-api-key": apiKey } },
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body).toMatchObject({ error: "file_variant_not_found" });
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

  it("rejects image downloads without files:read", async () => {
    const { apiKey, project } = await createPublicApiFixture();
    await db
      .update(schema.organizationApiKeys)
      .set({ permissions: ["jobs:read", "jobs:write"] })
      .where(eq(schema.organizationApiKeys.keyHash, hashApiKey(apiKey)));

    const response = await client.api.v1.projects[":projectId"].images.download.$get(
      {
        param: { projectId: project.id },
        query: { sourcePath: "assets/banner.png", locale: "fr" },
      },
      { headers: { "x-api-key": apiKey } },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: "forbidden" });
  });
});
