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
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const {
  dispatchWorkspaceAutomationForSourceUploadMock,
  dispatchWorkspaceAutomationsForSourceUploadMock,
} = vi.hoisted(() => ({
  dispatchWorkspaceAutomationForSourceUploadMock: vi.fn(),
  dispatchWorkspaceAutomationsForSourceUploadMock: vi.fn(),
}));

vi.mock("@/lib/agents/workspace-automation-dispatcher", () => ({
  dispatchWorkspaceAutomationForSourceUpload: dispatchWorkspaceAutomationForSourceUploadMock,
  dispatchWorkspaceAutomationsForSourceUpload: dispatchWorkspaceAutomationsForSourceUploadMock,
}));

import { createProjectTestFixture } from "@/api/routes/project/project.fixture";
import { insertStoredSourceFile } from "@/api/routes/public-jobs/public-jobs.fixture";
import { db, schema } from "@/lib/database/client";
import { createRepositorySourceFileVersion } from "@/lib/file-storage/records";
import type { SourceFileIngestQueue } from "@/lib/workflow/types";

import { reconcileSourceFileTranslationKeys } from "./reconcile-source-file-translation-keys";

import {
  claimSourceFileIngest,
  enqueueSourceFileIngestAfterUpload,
  entriesFromHlOutput,
  markSourceFileIngestState,
} from "./source-file-ingest";

const projectFixture = createProjectTestFixture();
const { cleanup, createStoredProjectFixture } = projectFixture;

const SOURCE_PATH = "locales/en.json";
const SOURCE_HASH = "sha256:source-hash-v1";

beforeAll(async () => {
  await db.$client.query("select 1");
});

beforeEach(() => {
  vi.clearAllMocks();
  dispatchWorkspaceAutomationForSourceUploadMock.mockResolvedValue(null);
  dispatchWorkspaceAutomationsForSourceUploadMock.mockResolvedValue([]);
});

afterEach(async () => {
  await cleanup();
});

async function createSourceVersion(input: {
  organizationId: string;
  projectId: string;
  sourcePath?: string;
  sourceHash?: string | null;
  ingestState?: (typeof schema.repositorySourceFileVersions.$inferSelect)["ingestState"];
  ingestWorkflowRunId?: string | null;
  filename?: string;
}) {
  const storedFile = await insertStoredSourceFile({
    organizationId: input.organizationId,
    projectId: input.projectId,
    filename: input.filename ?? `source-${randomUUID()}.json`,
    contentType: "application/json",
    sourceKind: "repository_file",
    metadata: {
      sourcePath: input.sourcePath ?? SOURCE_PATH,
    },
  });

  const version = await createRepositorySourceFileVersion({
    storedFile,
    sourcePath: input.sourcePath ?? SOURCE_PATH,
    sourceHash: input.sourceHash === undefined ? SOURCE_HASH : input.sourceHash,
    uploadSurface: "test",
  });

  if (input.ingestState || input.ingestWorkflowRunId !== undefined) {
    const [updated] = await db
      .update(schema.repositorySourceFileVersions)
      .set({
        ingestState: input.ingestState ?? version.ingestState,
        ingestWorkflowRunId: input.ingestWorkflowRunId ?? null,
        ingestedAt:
          input.ingestState === "ingested" || input.ingestState === "skipped" ? new Date() : null,
      })
      .where(eq(schema.repositorySourceFileVersions.id, version.id))
      .returning();

    if (!updated) {
      throw new Error("failed to set ingest state on fixture version");
    }

    return updated;
  }

  return version;
}

describe("entriesFromHlOutput", () => {
  it("maps hl entries output into project source string entries", () => {
    expect(
      entriesFromHlOutput({
        "greeting.title": "Hello",
        "greeting.subtitle": "Welcome",
      }),
    ).toEqual([
      {
        key: "greeting.title",
        text: "Hello",
        context: null,
        type: "string",
      },
      {
        key: "greeting.subtitle",
        text: "Welcome",
        context: null,
        type: "string",
      },
    ]);
  });

  it("drops blank keys and empty values", () => {
    expect(
      entriesFromHlOutput({
        "": "ignored",
        "valid.key": "   ",
        "kept.key": "Value",
      }),
    ).toEqual([
      {
        key: "kept.key",
        text: "Value",
        context: null,
        type: "string",
      },
    ]);
  });
});

describe("enqueueSourceFileIngestAfterUpload", () => {
  it("enqueues historical hashes so reverted uploads are reconciled", async () => {
    const { organization, project } = await createStoredProjectFixture();
    await createSourceVersion({
      organizationId: organization.id,
      projectId: project.id,
      ingestState: "ingested",
    });
    await createSourceVersion({
      organizationId: organization.id,
      projectId: project.id,
      sourceHash: "changed",
      ingestState: "ingested",
    });
    const pending = await createSourceVersion({
      organizationId: organization.id,
      projectId: project.id,
    });
    const enqueue = vi.fn(async () => ({ ids: ["run_revert"] }));
    await expect(
      enqueueSourceFileIngestAfterUpload({
        organizationId: organization.id,
        projectId: project.id,
        storedFileId: pending.storedFileId,
        sourceFileVersionId: pending.id,
        sourcePath: SOURCE_PATH,
        sourceHash: SOURCE_HASH,
        queue: { enqueue },
      }),
    ).resolves.toEqual({ enqueued: true, workflowRunIds: ["run_revert"] });
    expect(enqueue).toHaveBeenCalledOnce();
    expect(dispatchWorkspaceAutomationsForSourceUploadMock).not.toHaveBeenCalled();
  });

  it("enqueues ingest when the hash has not been ingested for the path", async () => {
    const { organization, project } = await createStoredProjectFixture();
    const pending = await createSourceVersion({
      organizationId: organization.id,
      projectId: project.id,
      ingestState: "pending",
      filename: "fresh.json",
    });

    const enqueue = vi.fn(async (event) => {
      expect(event).toEqual({
        sourceFileVersionId: pending.id,
        organizationId: organization.id,
        projectId: project.id,
        storedFileId: pending.storedFileId,
        sourcePath: SOURCE_PATH,
      });
      return { ids: ["run_ingest_1"] };
    });
    const queue: SourceFileIngestQueue = { enqueue };

    const result = await enqueueSourceFileIngestAfterUpload({
      organizationId: organization.id,
      projectId: project.id,
      storedFileId: pending.storedFileId,
      sourceFileVersionId: pending.id,
      sourcePath: SOURCE_PATH,
      sourceHash: SOURCE_HASH,
      queue,
    });

    expect(result).toEqual({ enqueued: true, workflowRunIds: ["run_ingest_1"] });
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(dispatchWorkspaceAutomationsForSourceUploadMock).not.toHaveBeenCalled();

    const [unchanged] = await db
      .select({ ingestState: schema.repositorySourceFileVersions.ingestState })
      .from(schema.repositorySourceFileVersions)
      .where(eq(schema.repositorySourceFileVersions.id, pending.id));
    expect(unchanged?.ingestState).toBe("pending");
  });

  it("carries the target automation through a fresh ingest event", async () => {
    const { organization, project } = await createStoredProjectFixture();
    const pending = await createSourceVersion({
      organizationId: organization.id,
      projectId: project.id,
      ingestState: "pending",
      filename: "fresh-targeted.json",
    });
    const enqueue = vi.fn(async () => ({ ids: ["run_ingest_targeted"] }));

    await enqueueSourceFileIngestAfterUpload({
      organizationId: organization.id,
      projectId: project.id,
      storedFileId: pending.storedFileId,
      sourceFileVersionId: pending.id,
      sourcePath: SOURCE_PATH,
      sourceHash: SOURCE_HASH,
      targetAutomationId: "automation-1",
      queue: { enqueue },
    });

    expect(enqueue).toHaveBeenCalledWith({
      sourceFileVersionId: pending.id,
      organizationId: organization.id,
      projectId: project.id,
      storedFileId: pending.storedFileId,
      sourcePath: SOURCE_PATH,
      targetAutomationId: "automation-1",
    });
  });
});

describe("claimSourceFileIngest", () => {
  it("claims pending and failed rows, and reclaims the same workflow run", async () => {
    const { organization, project } = await createStoredProjectFixture();
    const pending = await createSourceVersion({
      organizationId: organization.id,
      projectId: project.id,
      ingestState: "pending",
      filename: "claim-pending.json",
    });
    const failed = await createSourceVersion({
      organizationId: organization.id,
      projectId: project.id,
      ingestState: "failed",
      filename: "claim-failed.json",
    });
    const sameRun = await createSourceVersion({
      organizationId: organization.id,
      projectId: project.id,
      ingestState: "ingesting",
      ingestWorkflowRunId: "run_same",
      filename: "claim-same.json",
    });

    await expect(
      claimSourceFileIngest({
        sourceFileVersionId: pending.id,
        organizationId: organization.id,
        workflowRunId: "run_pending",
      }),
    ).resolves.toMatchObject({
      id: pending.id,
      sourceHash: SOURCE_HASH,
      sourcePath: SOURCE_PATH,
      projectId: project.id,
      storedFileId: pending.storedFileId,
    });

    await expect(
      claimSourceFileIngest({
        sourceFileVersionId: failed.id,
        organizationId: organization.id,
        workflowRunId: "run_failed",
      }),
    ).resolves.toMatchObject({ id: failed.id });

    await expect(
      claimSourceFileIngest({
        sourceFileVersionId: sameRun.id,
        organizationId: organization.id,
        workflowRunId: "run_same",
      }),
    ).resolves.toMatchObject({ id: sameRun.id });
  });

  it("does not steal an ingest owned by another workflow or already finished rows", async () => {
    const { organization, project } = await createStoredProjectFixture();
    const owned = await createSourceVersion({
      organizationId: organization.id,
      projectId: project.id,
      ingestState: "ingesting",
      ingestWorkflowRunId: "run_owner",
      filename: "owned.json",
    });
    const ingested = await createSourceVersion({
      organizationId: organization.id,
      projectId: project.id,
      ingestState: "ingested",
      filename: "done.json",
    });

    await expect(
      claimSourceFileIngest({
        sourceFileVersionId: owned.id,
        organizationId: organization.id,
        workflowRunId: "run_thief",
      }),
    ).resolves.toBeNull();

    await expect(
      claimSourceFileIngest({
        sourceFileVersionId: ingested.id,
        organizationId: organization.id,
        workflowRunId: "run_late",
      }),
    ).resolves.toBeNull();
  });
});

describe("markSourceFileIngestState", () => {
  it("marks ingesting rows owned by the workflow and rejects mismatched ownership", async () => {
    const { organization, project } = await createStoredProjectFixture();
    const owned = await createSourceVersion({
      organizationId: organization.id,
      projectId: project.id,
      ingestState: "ingesting",
      ingestWorkflowRunId: "run_owner",
      filename: "mark-owned.json",
    });

    await expect(
      markSourceFileIngestState({
        sourceFileVersionId: owned.id,
        organizationId: organization.id,
        ingestState: "ingested",
        ingestedAt: new Date(),
        fromIngestingWorkflowRunId: "run_owner",
      }),
    ).resolves.toEqual({ id: owned.id });

    const pending = await createSourceVersion({
      organizationId: organization.id,
      projectId: project.id,
      ingestState: "ingesting",
      ingestWorkflowRunId: "run_other",
      filename: "mark-mismatch.json",
    });

    await expect(
      markSourceFileIngestState({
        sourceFileVersionId: pending.id,
        organizationId: organization.id,
        ingestState: "failed",
        ingestError: "boom",
        fromIngestingWorkflowRunId: "run_wrong",
      }),
    ).rejects.toThrow(/not owned by workflow run_wrong/);
  });
});

describe("reconcileSourceFileTranslationKeys", () => {
  async function snapshot(
    organizationId: string,
    projectId: string,
    entries: { key: string; text: string }[],
    sourcePath = SOURCE_PATH,
  ) {
    const version = await createSourceVersion({
      organizationId,
      projectId,
      sourcePath,
      ingestState: "ingesting",
      ingestWorkflowRunId: "run_reconcile",
    });
    const input = {
      organizationId,
      projectId,
      repositorySourceFileId: version.repositorySourceFileId,
      sourceFileVersionId: version.id,
      workflowRunId: "run_reconcile",
      entries: entries.map((entry) => ({ ...entry, context: null })),
    };
    await reconcileSourceFileTranslationKeys(input);
    return input;
  }

  it("removes missing keys and their translations/comments while preserving retained IDs and other files", async () => {
    const { organization, project } = await createStoredProjectFixture();
    const first = await snapshot(organization.id, project.id, [
      { key: "keep", text: "Keep" },
      { key: "remove", text: "Remove" },
    ]);
    await snapshot(organization.id, project.id, [{ key: "remove", text: "Other" }], "other.json");
    const original = await db
      .select()
      .from(schema.projectTranslationKeys)
      .where(
        eq(schema.projectTranslationKeys.repositorySourceFileId, first.repositorySourceFileId),
      );
    for (const key of original) {
      await db.insert(schema.projectTranslations).values({
        organizationId: organization.id,
        projectId: project.id,
        translationKeyId: key.id,
        targetLocale: "fr",
        text: "Traduit",
      });
      await db.insert(schema.projectTranslationComments).values({
        organizationId: organization.id,
        projectId: project.id,
        translationKeyId: key.id,
        targetLocale: "fr",
        text: "Comment",
      });
    }
    const next = await snapshot(organization.id, project.id, [
      { key: "keep", text: "" },
      { key: "new", text: "New" },
    ]);
    await expect(reconcileSourceFileTranslationKeys(next)).resolves.toEqual({ status: "ingested" });
    const remaining = await db
      .select()
      .from(schema.projectTranslationKeys)
      .where(eq(schema.projectTranslationKeys.projectId, project.id));
    expect(remaining).toHaveLength(3);
    expect(remaining.find((key) => key.key === "keep")).toMatchObject({
      id: original.find((key) => key.key === "keep")!.id,
      sourceText: "",
    });
    expect(
      await db
        .select()
        .from(schema.projectTranslations)
        .where(eq(schema.projectTranslations.projectId, project.id)),
    ).toHaveLength(1);
    expect(
      await db
        .select()
        .from(schema.projectTranslationComments)
        .where(eq(schema.projectTranslationComments.projectId, project.id)),
    ).toHaveLength(1);
  });

  it("reconciles empty files and does not let an older workflow restore deleted keys", async () => {
    const { organization, project } = await createStoredProjectFixture();
    const old = await createSourceVersion({
      organizationId: organization.id,
      projectId: project.id,
      ingestState: "ingesting",
      ingestWorkflowRunId: "run_old",
    });
    await snapshot(organization.id, project.id, [{ key: "key", text: "Value" }]);
    await snapshot(organization.id, project.id, []);
    await expect(
      reconcileSourceFileTranslationKeys({
        organizationId: organization.id,
        projectId: project.id,
        repositorySourceFileId: old.repositorySourceFileId,
        sourceFileVersionId: old.id,
        workflowRunId: "run_old",
        entries: [{ key: "old", text: "Old", context: null }],
      }),
    ).resolves.toEqual({ status: "superseded" });
    expect(
      await db
        .select()
        .from(schema.projectTranslationKeys)
        .where(eq(schema.projectTranslationKeys.projectId, project.id)),
    ).toHaveLength(0);
  });

  it("imports and retains keys beyond 5000", async () => {
    const { organization, project } = await createStoredProjectFixture();
    const entries = Array.from({ length: 5001 }, (_, index) => ({
      key: `key-${index}`,
      text: `Value ${index}`,
    }));
    await snapshot(organization.id, project.id, entries);
    await snapshot(organization.id, project.id, entries.slice(1));
    const keys = await db
      .select()
      .from(schema.projectTranslationKeys)
      .where(eq(schema.projectTranslationKeys.projectId, project.id));
    expect(keys).toHaveLength(5000);
    expect(keys.some((key) => key.key === "key-5000")).toBe(true);
  });

  it("rolls back all batches and cleanup when a database write fails", async () => {
    const { organization, project } = await createStoredProjectFixture();
    const first = await snapshot(organization.id, project.id, [
      { key: "original", text: "Original" },
    ]);
    const version = await createSourceVersion({
      organizationId: organization.id,
      projectId: project.id,
      ingestState: "ingesting",
      ingestWorkflowRunId: "run_failure",
    });
    const entries = Array.from({ length: 501 }, (_, index) => ({
      key: `key-${index}`,
      text: index === 500 ? "invalid\u0000text" : "Valid",
    }));
    await expect(
      reconcileSourceFileTranslationKeys({
        ...first,
        sourceFileVersionId: version.id,
        workflowRunId: "run_failure",
        entries: entries.map((entry) => ({ ...entry, context: null })),
      }),
    ).rejects.toThrow();
    const keys = await db
      .select()
      .from(schema.projectTranslationKeys)
      .where(eq(schema.projectTranslationKeys.projectId, project.id));
    expect(keys.map((key) => key.key)).toEqual(["original"]);
    const [file] = await db
      .select()
      .from(schema.repositorySourceFiles)
      .where(eq(schema.repositorySourceFiles.id, first.repositorySourceFileId));
    expect(file.reconciledSourceFileVersionId).toBe(first.sourceFileVersionId);
  });
});
