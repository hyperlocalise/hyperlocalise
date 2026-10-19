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

import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { createProjectTestFixture } from "@/api/routes/project/project.fixture";
import { insertStoredSourceFile } from "@/api/routes/public-jobs/public-jobs.fixture";
import { db, schema } from "@/lib/database/client";
import { createRepositorySourceFileVersion } from "@/lib/file-storage/records";
import type { SourceFileIngestQueue } from "@/lib/workflow/types";

import {
  backfillKeylessOfficeSourceIngest,
  requeueKeylessOfficeSourceIngest,
} from "./office-legacy-reingest";
import { reconcileSourceFileTranslationKeys } from "./reconcile-source-file-translation-keys";

const { cleanup, createStoredProjectFixture } = createProjectTestFixture();

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  await cleanup();
});

function fakeQueue() {
  const enqueue = vi.fn<SourceFileIngestQueue["enqueue"]>(async () => ({ ids: ["run_reingest"] }));
  return { queue: { enqueue } satisfies SourceFileIngestQueue, enqueue };
}

async function ingestedVersion(input: {
  organizationId: string;
  projectId: string;
  sourcePath: string;
}) {
  const storedFile = await insertStoredSourceFile({
    organizationId: input.organizationId,
    projectId: input.projectId,
    filename: `source-${randomUUID()}`,
    contentType: "application/octet-stream",
    sourceKind: "repository_file",
    metadata: { sourcePath: input.sourcePath },
  });
  const version = await createRepositorySourceFileVersion({
    storedFile,
    sourcePath: input.sourcePath,
    sourceHash: `sha256:${randomUUID()}`,
    uploadSurface: "test",
  });
  await db
    .update(schema.repositorySourceFileVersions)
    .set({ ingestState: "ingested", ingestedAt: new Date() })
    .where(eq(schema.repositorySourceFileVersions.id, version.id));
  return version;
}

async function ingestState(versionId: string) {
  const [row] = await db
    .select({ ingestState: schema.repositorySourceFileVersions.ingestState })
    .from(schema.repositorySourceFileVersions)
    .where(eq(schema.repositorySourceFileVersions.id, versionId));
  return row?.ingestState;
}

describe("requeueKeylessOfficeSourceIngest", () => {
  it("resets a keyless Office upload to pending and enqueues a re-ingest", async () => {
    const { organization, project } = await createStoredProjectFixture();
    const version = await ingestedVersion({
      organizationId: organization.id,
      projectId: project.id,
      sourcePath: "docs/Report.DOCX",
    });
    const { queue, enqueue } = fakeQueue();

    await expect(
      requeueKeylessOfficeSourceIngest({
        organizationId: organization.id,
        projectId: project.id,
        sourcePath: "docs/Report.DOCX",
        queue,
      }),
    ).resolves.toBe(true);

    expect(await ingestState(version.id)).toBe("pending");
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ sourceFileVersionId: version.id, reingest: true }),
    );
  });

  it("restores the ingested state when enqueueing fails so a later open can retry", async () => {
    const { organization, project } = await createStoredProjectFixture();
    const version = await ingestedVersion({
      organizationId: organization.id,
      projectId: project.id,
      sourcePath: "docs/outage.docx",
    });
    const input = {
      organizationId: organization.id,
      projectId: project.id,
      sourcePath: "docs/outage.docx",
    };
    const failingQueue: SourceFileIngestQueue = {
      enqueue: vi.fn(async () => {
        throw new Error("workflow unavailable");
      }),
    };

    await expect(
      requeueKeylessOfficeSourceIngest({ ...input, queue: failingQueue }),
    ).rejects.toThrow("workflow unavailable");
    expect(await ingestState(version.id)).toBe("ingested");

    const { queue, enqueue } = fakeQueue();
    await expect(requeueKeylessOfficeSourceIngest({ ...input, queue })).resolves.toBe(true);
    expect(enqueue).toHaveBeenCalledOnce();
  });

  it("does not requeue an Office file whose segment ingest found no text", async () => {
    const { organization, project } = await createStoredProjectFixture();
    const scope = { organizationId: organization.id, projectId: project.id };
    const version = await ingestedVersion({ ...scope, sourcePath: "docs/images-only.docx" });
    await db
      .update(schema.repositorySourceFileVersions)
      .set({ ingestState: "ingesting", ingestWorkflowRunId: "run_empty" })
      .where(eq(schema.repositorySourceFileVersions.id, version.id));
    await reconcileSourceFileTranslationKeys({
      ...scope,
      repositorySourceFileId: version.repositorySourceFileId,
      sourceFileVersionId: version.id,
      workflowRunId: "run_empty",
      entries: [],
    });
    const { queue, enqueue } = fakeQueue();

    await expect(
      requeueKeylessOfficeSourceIngest({ ...scope, sourcePath: "docs/images-only.docx", queue }),
    ).resolves.toBe(false);
    await backfillKeylessOfficeSourceIngest({ queue });

    expect(await ingestState(version.id)).toBe("ingested");
    expect(enqueue).not.toHaveBeenCalledWith(
      expect.objectContaining({ sourceFileVersionId: version.id }),
    );
  });

  it("leaves keyed Office files and non-Office files alone", async () => {
    const { organization, project } = await createStoredProjectFixture();
    const keyed = await ingestedVersion({
      organizationId: organization.id,
      projectId: project.id,
      sourcePath: "slides/deck.pptx",
    });
    await db
      .update(schema.repositorySourceFileVersions)
      .set({ ingestState: "ingesting", ingestWorkflowRunId: "run_keys" })
      .where(eq(schema.repositorySourceFileVersions.id, keyed.id));
    await reconcileSourceFileTranslationKeys({
      organizationId: organization.id,
      projectId: project.id,
      repositorySourceFileId: keyed.repositorySourceFileId,
      sourceFileVersionId: keyed.id,
      workflowRunId: "run_keys",
      entries: [{ key: "ppt/slides/slide1.xml#0", text: "Hello", context: null }],
    });
    await db
      .update(schema.repositorySourceFileVersions)
      .set({ ingestState: "ingested" })
      .where(eq(schema.repositorySourceFileVersions.id, keyed.id));
    await ingestedVersion({
      organizationId: organization.id,
      projectId: project.id,
      sourcePath: "docs/readme.md",
    });
    const { queue, enqueue } = fakeQueue();

    for (const sourcePath of ["slides/deck.pptx", "docs/readme.md"]) {
      await expect(
        requeueKeylessOfficeSourceIngest({
          organizationId: organization.id,
          projectId: project.id,
          sourcePath,
          queue,
        }),
      ).resolves.toBe(false);
    }
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("lets only one concurrent open claim a keyless Office upload", async () => {
    const { organization, project } = await createStoredProjectFixture();
    const version = await ingestedVersion({
      organizationId: organization.id,
      projectId: project.id,
      sourcePath: "docs/shared.docx",
    });
    const { queue, enqueue } = fakeQueue();
    const input = {
      organizationId: organization.id,
      projectId: project.id,
      sourcePath: "docs/shared.docx",
      queue,
    };

    const results = await Promise.all([
      requeueKeylessOfficeSourceIngest(input),
      requeueKeylessOfficeSourceIngest(input),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await ingestState(version.id)).toBe("pending");
    expect(enqueue).toHaveBeenCalledOnce();
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ sourceFileVersionId: version.id, reingest: true }),
    );
  });
});

describe("backfillKeylessOfficeSourceIngest", () => {
  it("requeues only the latest version of each keyless Office path", async () => {
    const { organization, project } = await createStoredProjectFixture();
    const scope = { organizationId: organization.id, projectId: project.id };
    const older = await ingestedVersion({ ...scope, sourcePath: "data/legacy.xls" });
    const latest = await ingestedVersion({ ...scope, sourcePath: "data/legacy.xls" });
    await db
      .update(schema.repositorySourceFileVersions)
      .set({ createdAt: new Date(latest.createdAt.getTime() - 60_000) })
      .where(eq(schema.repositorySourceFileVersions.id, older.id));
    const { queue, enqueue } = fakeQueue();

    await backfillKeylessOfficeSourceIngest({ queue });

    expect(await ingestState(older.id)).toBe("ingested");
    expect(await ingestState(latest.id)).toBe("pending");
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ sourceFileVersionId: latest.id }),
    );
    expect(enqueue).not.toHaveBeenCalledWith(
      expect.objectContaining({ sourceFileVersionId: older.id }),
    );
  });

  it("counts only claims that still match after SELECT, skipping a reconciled peer", async () => {
    const { organization, project } = await createStoredProjectFixture();
    const scope = { organizationId: organization.id, projectId: project.id };
    const keyless = await ingestedVersion({ ...scope, sourcePath: "docs/open.docx" });
    const reconciled = await ingestedVersion({ ...scope, sourcePath: "docs/images-only.docx" });
    await db
      .update(schema.repositorySourceFileVersions)
      .set({ ingestState: "ingesting", ingestWorkflowRunId: "run_empty" })
      .where(eq(schema.repositorySourceFileVersions.id, reconciled.id));
    await reconcileSourceFileTranslationKeys({
      ...scope,
      repositorySourceFileId: reconciled.repositorySourceFileId,
      sourceFileVersionId: reconciled.id,
      workflowRunId: "run_empty",
      entries: [],
    });
    const { queue, enqueue } = fakeQueue();

    await expect(backfillKeylessOfficeSourceIngest({ queue })).resolves.toEqual({ requeued: 1 });

    expect(await ingestState(keyless.id)).toBe("pending");
    expect(await ingestState(reconciled.id)).toBe("ingested");
    expect(enqueue).toHaveBeenCalledOnce();
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ sourceFileVersionId: keyless.id, reingest: true }),
    );
  });

  it("pages past the default batch size so later keyless paths are not skipped", async () => {
    const { organization, project } = await createStoredProjectFixture();
    const scope = { organizationId: organization.id, projectId: project.id };
    const versions = await Promise.all(
      ["docs/a.docx", "docs/b.pptx", "docs/c.xlsx"].map((sourcePath) =>
        ingestedVersion({ ...scope, sourcePath }),
      ),
    );
    const { queue, enqueue } = fakeQueue();

    await expect(backfillKeylessOfficeSourceIngest({ queue, batchSize: 2 })).resolves.toEqual({
      requeued: 3,
    });

    expect(enqueue).toHaveBeenCalledTimes(3);
    for (const version of versions) {
      expect(await ingestState(version.id)).toBe("pending");
      expect(enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ sourceFileVersionId: version.id }),
      );
    }
  });
});
