import "dotenv/config";

import { and, eq } from "drizzle-orm";
import { testClient } from "hono/testing";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { createApp } from "@/api/app";
import { db, schema } from "@/lib/database";
import { err, ok } from "@/lib/primitives/result/results";

import {
  createMemoryFileStorageAdapter,
  createExternalTmsPublicApiFixture,
  createPublicApiFixture,
  cleanupPublicApiFixture,
} from "./public-files.fixture";

const uploadSourceFileMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/providers/adapters/tms-provider-adapter-registry", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/providers/adapters/tms-provider-adapter-registry")>();
  return {
    ...actual,
    getTmsProviderAdapter: () => ({
      uploadSourceFile: uploadSourceFileMock,
    }),
  };
});

const fileStorageAdapter = createMemoryFileStorageAdapter();
const client = testClient(createApp({ fileStorageAdapter }));

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  uploadSourceFileMock.mockReset();
  await cleanupPublicApiFixture();
});

describe("publicFileRoutes", () => {
  it("uploads a repository source file for a double-encoded external project id", async () => {
    const { apiKey, project } = await createPublicApiFixture();
    const projectId = `ext:crowdin:${project.id}`;
    const encodedProjectId = encodeURIComponent(encodeURIComponent(projectId));
    await db
      .update(schema.projects)
      .set({ id: projectId })
      .where(eq(schema.projects.id, project.id));

    const uploadResponse = await client.api.v1.files.$post(
      {
        form: {
          projectId: encodedProjectId,
          sourcePath: "content/en/home.md",
          file: new File(["# Hello"], "home.md", { type: "text/markdown" }),
        },
      },
      { headers: { "x-api-key": apiKey } },
    );

    expect(uploadResponse.status).toBe(201);
    const uploadBody = (await uploadResponse.json()) as {
      file: { destination: "native" };
    };
    expect(uploadBody.file.destination).toBe("native");
    const [storedFile] = await db
      .select({ projectId: schema.storedFiles.projectId })
      .from(schema.storedFiles)
      .where(eq(schema.storedFiles.projectId, projectId))
      .limit(1);
    expect(storedFile?.projectId).toBe(projectId);
  });

  it("uploads a source file to an external TMS project through the provider adapter", async () => {
    const { apiKey, project, externalProjectId } =
      await createExternalTmsPublicApiFixture("phrase");
    uploadSourceFileMock.mockResolvedValue(
      ok({
        sourcePath: "content/en/home.json",
        externalResourceId: "upload_1",
        revision: "rev_1",
        asyncOperation: null,
        providerPayload: { state: "success" },
      }),
    );

    const uploadResponse = await client.api.v1.files.$post(
      {
        form: {
          projectId: project.id,
          sourcePath: "content/en/home.json",
          sourceLocale: "en",
          format: "json",
          branch: "main",
          file: new File([`{"hello":"Hello"}`], "home.json", { type: "application/json" }),
        },
      },
      { headers: { "x-api-key": apiKey } },
    );

    expect(uploadResponse.status).toBe(201);
    await expect(uploadResponse.json()).resolves.toEqual({
      file: {
        id: "upload_1",
        destination: "external_tms",
        sourcePath: "content/en/home.json",
        providerKind: "phrase",
        externalProjectId,
        externalResourceId: "upload_1",
        revision: "rev_1",
        asyncOperation: null,
        providerPayload: { state: "success" },
      },
    });

    expect(uploadSourceFileMock).toHaveBeenCalledTimes(1);
    const adapterInput = uploadSourceFileMock.mock.calls[0]?.[0];
    expect(adapterInput).toEqual(
      expect.objectContaining({
        organizationId: project.organizationId,
        projectId: project.id,
        externalProjectId,
        secretMaterial: "provider-token",
        file: expect.objectContaining({
          sourcePath: "content/en/home.json",
          filename: "home.json",
          contentType: "application/json",
          sourceLocale: "en",
          format: "json",
          branch: "main",
        }),
      }),
    );
    expect(Buffer.from(adapterInput.file.content).toString("utf8")).toBe(`{"hello":"Hello"}`);

    const storedFiles = await db
      .select({ id: schema.storedFiles.id })
      .from(schema.storedFiles)
      .where(eq(schema.storedFiles.projectId, project.id));
    expect(storedFiles).toHaveLength(0);
  });

  it("maps typed provider upload errors without matching error messages", async () => {
    const { apiKey, project } = await createExternalTmsPublicApiFixture("phrase");
    uploadSourceFileMock.mockResolvedValue(err({ code: "phrase_source_locale_not_found" }));

    const response = await client.api.v1.files.$post(
      {
        form: {
          projectId: project.id,
          sourcePath: "content/en/home.json",
          branch: "missing",
          file: new File([`{"hello":"Hello"}`], "home.json", { type: "application/json" }),
        },
      },
      { headers: { "x-api-key": apiKey } },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "invalid_file_payload",
      message: "phrase_source_locale_not_found",
    });
  });

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
