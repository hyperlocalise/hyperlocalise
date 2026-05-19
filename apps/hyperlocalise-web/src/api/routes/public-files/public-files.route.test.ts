import "dotenv/config";

import { and, eq } from "drizzle-orm";
import { testClient } from "hono/testing";
import { afterEach, beforeAll, describe, expect, it } from "vite-plus/test";

import { createApp } from "@/api/app";
import { db, schema } from "@/lib/database";

import {
  createMemoryFileStorageAdapter,
  createPublicApiFixture,
  cleanupPublicApiFixture,
} from "./public-files.fixture";

const fileStorageAdapter = createMemoryFileStorageAdapter();
const client = testClient(createApp({ fileStorageAdapter }));

beforeAll(async () => {
  await db.$client.query("select 1");
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
    const uploadBody = (await uploadResponse.json()) as {
      file: { id: string; sourceFileVersionId: string };
    };
    expect(uploadBody.file.id).toMatch(/^file_/);
    expect(uploadBody.file.sourceFileVersionId).toEqual(expect.any(String));

    const downloadResponse = await client.api.v1.files[":fileId"].download.$get(
      { param: { fileId: uploadBody.file.id } },
      { headers: { "x-api-key": apiKey } },
    );

    expect(downloadResponse.status).toBe(200);
    expect(await downloadResponse.text()).toBe("# Hello");
  });

  it("groups repeated repository uploads by project and source path", async () => {
    const { apiKey, project } = await createPublicApiFixture();

    const firstUpload = await client.api.v1.files.$post(
      {
        form: {
          projectId: project.id,
          sourcePath: "content/en/home.md",
          sourceHash: "sha256:first",
          commitSha: "abc123",
          workflowRunId: "run_1",
          file: new File(["# Hello"], "home.md", { type: "text/markdown" }),
        },
      },
      { headers: { "x-api-key": apiKey } },
    );
    const secondUpload = await client.api.v1.files.$post(
      {
        form: {
          projectId: project.id,
          sourcePath: "content/en/home.md",
          sourceHash: "sha256:second",
          commitSha: "def456",
          workflowRunId: "run_2",
          file: new File(["# Hello again"], "home.md", { type: "text/markdown" }),
        },
      },
      { headers: { "x-api-key": apiKey } },
    );

    expect(firstUpload.status).toBe(201);
    expect(secondUpload.status).toBe(201);

    const sourceFiles = await db
      .select()
      .from(schema.repositorySourceFiles)
      .where(
        and(
          eq(schema.repositorySourceFiles.projectId, project.id),
          eq(schema.repositorySourceFiles.sourcePath, "content/en/home.md"),
        ),
      );
    expect(sourceFiles).toHaveLength(1);
    const sourceFile = sourceFiles[0];
    if (!sourceFile) {
      throw new Error("repository source file was not created");
    }

    const versions = await db
      .select()
      .from(schema.repositorySourceFileVersions)
      .where(eq(schema.repositorySourceFileVersions.repositorySourceFileId, sourceFile.id));
    expect(versions).toHaveLength(2);
    expect(
      versions
        .map((version) => version.sourceHash)
        .sort((a, b) => String(a).localeCompare(String(b))),
    ).toEqual(["sha256:first", "sha256:second"]);
    expect(
      versions
        .map((version) => version.workflowRunId)
        .sort((a, b) => String(a).localeCompare(String(b))),
    ).toEqual(["run_1", "run_2"]);
    expect(new Set(versions.map((version) => version.storedFileId)).size).toBe(2);
  });

  it("rejects unsupported source file formats", async () => {
    const { apiKey, project } = await createPublicApiFixture();

    const response = await client.api.v1.files.$post(
      {
        form: {
          projectId: project.id,
          sourcePath: "Dockerfile",
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
