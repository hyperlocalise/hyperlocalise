import "dotenv/config";

import { testClient } from "hono/testing";
import { afterEach, beforeAll, describe, expect, it } from "vite-plus/test";

import { createApp } from "@/api/app";
import { db } from "@/lib/database";

import {
  createMemoryFileStorageAdapter,
  createPublicApiFixture,
  cleanupPublicApiFixture,
  ensurePublicFilesTestSchema,
} from "./public-files.fixture";

const fileStorageAdapter = createMemoryFileStorageAdapter();
const client = testClient(createApp({ fileStorageAdapter }));

beforeAll(async () => {
  await db.$client.query("select 1");
  await ensurePublicFilesTestSchema();
});

afterEach(async () => {
  await cleanupPublicApiFixture();
});

describe("publicFileRoutes", () => {
  it("uploads and downloads a repository source file with an API key", async () => {
    const { apiKey, project } = await createPublicApiFixture();

    const uploadResponse = await client.api.v1.files.$post(
      {
        form: {
          projectId: project.id,
          sourcePath: "content/en/home.md",
          sourceHash: "sha256:abc123",
          file: new File(["# Hello"], "home.md", { type: "text/markdown" }),
        },
      },
      { headers: { "x-api-key": apiKey } },
    );

    expect(uploadResponse.status).toBe(201);
    const uploadBody = (await uploadResponse.json()) as { file: { id: string } };
    expect(uploadBody.file.id).toMatch(/^file_/);

    const downloadResponse = await client.api.v1.files[":fileId"].download.$get(
      { param: { fileId: uploadBody.file.id } },
      { headers: { "x-api-key": apiKey } },
    );

    expect(downloadResponse.status).toBe(200);
    expect(await downloadResponse.text()).toBe("# Hello");
  });

  it("rejects unsupported source file formats", async () => {
    const { apiKey, project } = await createPublicApiFixture();

    const response = await client.api.v1.files.$post(
      {
        form: {
          projectId: project.id,
          file: new File(["FROM node"], "Dockerfile", { type: "text/plain" }),
        },
      },
      { headers: { "x-api-key": apiKey } },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "unsupported_translation_source_file",
      details: {
        filename: "Dockerfile",
      },
    });
  });
});
