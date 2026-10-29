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

import { randomUUID } from "node:crypto";

import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { createProjectTestFixture } from "@/api/routes/project/project.fixture";
import { insertStoredSourceFile } from "@/api/routes/public-jobs/public-jobs.fixture";
import { db, schema } from "@/lib/database/client";
import { ensureRepositorySourceFile } from "@/lib/file-storage/records";

import { listPullTranslationExportCandidates } from "./github-repository-automation-pull-translations-export";

vi.mock("@/lib/file-storage/get-file-storage-adapter", () => ({
  getFileStorageAdapter: () => ({
    get: async () => ({ body: new Response('{"greeting":"Bonjour"}').body }),
  }),
}));

const projectFixture = createProjectTestFixture();
const SOURCE_PATH = "locales/en.json";
const CONFIG_JSON = {
  locales: { source: "en", targets: ["fr"] },
  buckets: { json: { files: [{ from: "locales/[locale].json", to: "locales/[locale].json" }] } },
};

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  await projectFixture.cleanup();
});

describe("listPullTranslationExportCandidates", () => {
  it("keeps the AI translation when a newer task for people on the file is marked done", async () => {
    const { organization, project, user } = await projectFixture.createStoredProjectFixture();
    const sourceFile = await ensureRepositorySourceFile({
      organizationId: organization.id,
      projectId: project.id,
      sourcePath: SOURCE_PATH,
    });
    const storedSource = await insertStoredSourceFile({
      organizationId: organization.id,
      projectId: project.id,
      filename: "en.json",
      contentType: "application/json",
      sourceKind: "repository_file",
      metadata: { sourcePath: SOURCE_PATH },
    });
    const [version] = await db
      .insert(schema.repositorySourceFileVersions)
      .values({
        repositorySourceFileId: sourceFile.id,
        organizationId: organization.id,
        projectId: project.id,
        sourcePath: SOURCE_PATH,
        storedFileId: storedSource.id,
      })
      .returning();
    const outputFileId = `file_${randomUUID()}`;
    await db.insert(schema.storedFiles).values({
      id: outputFileId,
      organizationId: organization.id,
      projectId: project.id,
      role: "output",
      sourceKind: "repository_file",
      storageProvider: "vercel_blob",
      storageKey: `outputs/${outputFileId}/fr.json`,
      storageUrl: `https://example.com/${outputFileId}/fr.json`,
      downloadUrl: `https://example.com/${outputFileId}/fr.json?download=1`,
      filename: "fr.json",
      contentType: "application/json",
      byteSize: 2,
      sha256: "44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a",
      metadata: {},
    });

    const insertFileJob = async (input: {
      kind: "translation" | "proofread";
      createdAt: Date;
      outcomeKind?: "file_result";
      outcomePayload?: Record<string, unknown>;
    }) => {
      const id = `job_${randomUUID()}`;
      await db.insert(schema.jobs).values({
        id,
        organizationId: organization.id,
        projectId: project.id,
        createdByUserId: user.id,
        kind: input.kind,
        status: "succeeded",
        inputPayload: { sourceLocale: "en", targetLocales: ["fr"] },
        outcomePayload: input.outcomePayload ?? { code: "marked_done_by_user" },
        createdAt: input.createdAt,
      });
      await db.insert(schema.translationJobDetails).values({
        jobId: id,
        type: "file",
        sourceFileVersionId: version!.id,
        outcomeKind: input.outcomeKind ?? null,
      });
      return id;
    };

    const aiJobId = await insertFileJob({
      kind: "translation",
      createdAt: new Date("2026-10-01T00:00:00Z"),
      outcomeKind: "file_result",
      outcomePayload: {
        outputFiles: [{ fileId: outputFileId, locale: "fr", filename: "fr.json" }],
      },
    });
    await insertFileJob({ kind: "proofread", createdAt: new Date("2026-10-02T00:00:00Z") });

    const candidates = await listPullTranslationExportCandidates({
      organizationId: organization.id,
      projectId: project.id,
      configJson: CONFIG_JSON,
    });

    expect(candidates).toEqual([
      expect.objectContaining({
        sourcePath: SOURCE_PATH,
        targetPath: "locales/fr.json",
        locale: "fr",
        translationJobId: aiJobId,
      }),
    ]);
  });
});
