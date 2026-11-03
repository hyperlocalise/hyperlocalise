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

import { GITLAB_CONTENT_SYNC_UPLOAD_SURFACE } from "@/lib/agents/content-sync/content-sync-types";

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
  uploadSurface?: string;
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
    uploadSurface: input.uploadSurface ?? "test",
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

  it("rejects blank or duplicate keys before mutating the database", async () => {
    const { organization, project } = await createStoredProjectFixture();
    const version = await createSourceVersion({
      organizationId: organization.id,
      projectId: project.id,
      ingestState: "ingesting",
      ingestWorkflowRunId: "run_invalid",
    });
    const base = {
      organizationId: organization.id,
      projectId: project.id,
      repositorySourceFileId: version.repositorySourceFileId,
      sourceFileVersionId: version.id,
      workflowRunId: "run_invalid",
    };

    await expect(
      reconcileSourceFileTranslationKeys({
        ...base,
        entries: [
          { key: "ok", text: "Ok", context: null },
          { key: "  ", text: "Blank", context: null },
        ],
      }),
    ).rejects.toThrow(/blank or duplicate keys/);
    await expect(
      reconcileSourceFileTranslationKeys({
        ...base,
        entries: [
          { key: "dup", text: "One", context: null },
          { key: "dup", text: "Two", context: null },
        ],
      }),
    ).rejects.toThrow(/blank or duplicate keys/);

    expect(
      await db
        .select()
        .from(schema.projectTranslationKeys)
        .where(eq(schema.projectTranslationKeys.projectId, project.id)),
    ).toHaveLength(0);
  });

  it("rejects reconciles owned by a different workflow run", async () => {
    const { organization, project } = await createStoredProjectFixture();
    const version = await createSourceVersion({
      organizationId: organization.id,
      projectId: project.id,
      ingestState: "ingesting",
      ingestWorkflowRunId: "run_owner",
    });

    await expect(
      reconcileSourceFileTranslationKeys({
        organizationId: organization.id,
        projectId: project.id,
        repositorySourceFileId: version.repositorySourceFileId,
        sourceFileVersionId: version.id,
        workflowRunId: "run_intruder",
        entries: [{ key: "k", text: "v", context: null }],
      }),
    ).rejects.toThrow(/not owned by this workflow/);
  });

  it("is idempotent when the version is already reconciled", async () => {
    const { organization, project } = await createStoredProjectFixture();
    const input = await snapshot(organization.id, project.id, [{ key: "keep", text: "Keep" }]);
    await expect(reconcileSourceFileTranslationKeys(input)).resolves.toEqual({
      status: "ingested",
    });
    expect(
      await db
        .select()
        .from(schema.projectTranslationKeys)
        .where(eq(schema.projectTranslationKeys.projectId, project.id)),
    ).toHaveLength(1);
  });

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

  it("sends approved translations of changed source text back to review", async () => {
    const { organization, project } = await createStoredProjectFixture();
    await snapshot(organization.id, project.id, [
      { key: "changed", text: "Save" },
      { key: "same", text: "Cancel" },
    ]);
    const keys = await db
      .select()
      .from(schema.projectTranslationKeys)
      .where(eq(schema.projectTranslationKeys.projectId, project.id));
    const keyId = (key: string) => keys.find((row) => row.key === key)!.id;
    const reviewedAt = new Date("2026-01-01T00:00:00Z");
    await db.insert(schema.projectTranslations).values(
      [
        { key: "changed", targetLocale: "fr", status: "approved" as const },
        { key: "changed", targetLocale: "de", status: "draft" as const },
        { key: "same", targetLocale: "fr", status: "approved" as const },
      ].map((row) => ({
        organizationId: organization.id,
        projectId: project.id,
        translationKeyId: keyId(row.key),
        targetLocale: row.targetLocale,
        text: `${row.key} ${row.targetLocale}`,
        status: row.status,
        provenance: "import" as const,
        reviewedAt: row.status === "approved" ? reviewedAt : null,
      })),
    );

    await snapshot(organization.id, project.id, [
      { key: "changed", text: "Save changes" },
      { key: "same", text: "Cancel" },
    ]);

    const translations = await db
      .select()
      .from(schema.projectTranslations)
      .where(eq(schema.projectTranslations.projectId, project.id));
    const state = (key: string, locale: string) =>
      translations.find(
        (row) => row.translationKeyId === keyId(key) && row.targetLocale === locale,
      );
    expect(state("changed", "fr")).toMatchObject({
      status: "needs_review",
      text: "changed fr",
      reviewedAt: null,
    });
    expect(state("changed", "de")).toMatchObject({ status: "draft" });
    expect(state("same", "fr")).toMatchObject({ status: "approved", reviewedAt });
    const revisions = await db
      .select()
      .from(schema.projectTranslationRevisions)
      .where(eq(schema.projectTranslationRevisions.projectId, project.id));
    expect(
      revisions
        .toSorted((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map((row) => [row.translationId, row.status, row.actorKind]),
    ).toEqual([
      [state("changed", "fr")!.id, "approved", "system"],
      [state("changed", "fr")!.id, "needs_review", "system"],
    ]);
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

describe("reconcileSourceFileTranslationKeys for a GitLab sync", () => {
  async function syncSnapshot(input: {
    organizationId: string;
    projectId: string;
    entries: { key: string; text: string }[];
    runId: string;
  }) {
    const version = await createSourceVersion({
      organizationId: input.organizationId,
      projectId: input.projectId,
      ingestState: "ingesting",
      ingestWorkflowRunId: input.runId,
      uploadSurface: GITLAB_CONTENT_SYNC_UPLOAD_SURFACE,
    });
    const result = await reconcileSourceFileTranslationKeys({
      organizationId: input.organizationId,
      projectId: input.projectId,
      repositorySourceFileId: version.repositorySourceFileId,
      sourceFileVersionId: version.id,
      workflowRunId: input.runId,
      entries: input.entries.map((entry) => ({ ...entry, context: null })),
    });
    const [stored] = await db
      .select({ syncReport: schema.repositorySourceFileVersions.syncReport })
      .from(schema.repositorySourceFileVersions)
      .where(eq(schema.repositorySourceFileVersions.id, version.id));
    return { result, storedReport: stored?.syncReport, fileId: version.repositorySourceFileId };
  }

  async function keysByName(fileId: string) {
    const rows = await db
      .select({
        key: schema.projectTranslationKeys.key,
        sourceText: schema.projectTranslationKeys.sourceText,
        importedSourceText: schema.projectTranslationKeys.importedSourceText,
        isHidden: schema.projectTranslationKeys.isHidden,
        hiddenBySyncAt: schema.projectTranslationKeys.hiddenBySyncAt,
        id: schema.projectTranslationKeys.id,
      })
      .from(schema.projectTranslationKeys)
      .where(eq(schema.projectTranslationKeys.repositorySourceFileId, fileId));
    return new Map(rows.map((row) => [row.key, row]));
  }

  it("hides keys the repository dropped and unhides only the ones a sync hid", async () => {
    const { organization, project } = await createStoredProjectFixture();
    const first = await syncSnapshot({
      organizationId: organization.id,
      projectId: project.id,
      runId: "run_sync_1",
      entries: [
        { key: "keep", text: "Keep" },
        { key: "dropped", text: "Dropped" },
        { key: "manual", text: "Manual" },
      ],
    });
    expect(first.result).toEqual({
      status: "ingested",
      syncReport: { clashes: [], missingKeys: [] },
    });
    const manual = (await keysByName(first.fileId)).get("manual")!;
    await db
      .update(schema.projectTranslationKeys)
      .set({ isHidden: true })
      .where(eq(schema.projectTranslationKeys.id, manual.id));

    const second = await syncSnapshot({
      organizationId: organization.id,
      projectId: project.id,
      runId: "run_sync_2",
      entries: [{ key: "keep", text: "Keep" }],
    });
    // Only keys this sync hid are listed: "manual" was hidden by hand before it.
    expect(second.result).toEqual({
      status: "ingested",
      syncReport: { clashes: [], missingKeys: ["dropped"] },
    });
    expect(second.storedReport).toEqual({ clashes: [], missingKeys: ["dropped"] });
    let keys = await keysByName(first.fileId);
    expect(keys.get("dropped")).toMatchObject({ isHidden: true });
    expect(keys.get("dropped")?.hiddenBySyncAt).not.toBeNull();
    // Hidden by hand before the sync, so the sync doesn't claim it.
    expect(keys.get("manual")).toMatchObject({ isHidden: true, hiddenBySyncAt: null });

    const third = await syncSnapshot({
      organizationId: organization.id,
      projectId: project.id,
      runId: "run_sync_3",
      entries: [
        { key: "keep", text: "Keep" },
        { key: "dropped", text: "Dropped" },
        { key: "manual", text: "Manual" },
      ],
    });
    expect(third.result).toEqual({
      status: "ingested",
      syncReport: { clashes: [], missingKeys: [] },
    });
    keys = await keysByName(first.fileId);
    expect(keys.get("dropped")).toMatchObject({ isHidden: false, hiddenBySyncAt: null });
    expect(keys.get("manual")).toMatchObject({ isHidden: true, hiddenBySyncAt: null });
  });

  it("replaces platform source text while the project keeps source text to the repository", async () => {
    const { organization, project } = await createStoredProjectFixture();
    const first = await syncSnapshot({
      organizationId: organization.id,
      projectId: project.id,
      runId: "run_off_1",
      entries: [{ key: "title", text: "Home" }],
    });
    const title = (await keysByName(first.fileId)).get("title")!;
    expect(title.importedSourceText).toBe("Home");
    await db
      .update(schema.projectTranslationKeys)
      .set({ sourceText: "Home (edited here)" })
      .where(eq(schema.projectTranslationKeys.id, title.id));

    const second = await syncSnapshot({
      organizationId: organization.id,
      projectId: project.id,
      runId: "run_off_2",
      entries: [{ key: "title", text: "Home" }],
    });
    expect(second.result).toEqual({
      status: "ingested",
      syncReport: { clashes: [], missingKeys: [] },
    });
    expect((await keysByName(first.fileId)).get("title")).toMatchObject({
      sourceText: "Home",
      importedSourceText: "Home",
    });
  });

  it("keeps platform edits, takes repository edits and reports clashes when source text is editable", async () => {
    const { organization, project } = await createStoredProjectFixture();
    await db
      .update(schema.projects)
      .set({ sourceTextEditable: true })
      .where(eq(schema.projects.id, project.id));
    const first = await syncSnapshot({
      organizationId: organization.id,
      projectId: project.id,
      runId: "run_on_1",
      entries: [
        { key: "platform", text: "Platform v1" },
        { key: "repo", text: "Repo v1" },
        { key: "both", text: "Both v1" },
        { key: "agreed", text: "Agreed v1" },
        { key: "same", text: "Same" },
      ],
    });
    const keys = await keysByName(first.fileId);
    for (const [key, text] of [
      ["platform", "Platform edited here"],
      ["both", "Both edited here"],
      ["agreed", "Agreed v2"],
    ] as const) {
      await db
        .update(schema.projectTranslationKeys)
        .set({ sourceText: text })
        .where(eq(schema.projectTranslationKeys.id, keys.get(key)!.id));
    }
    for (const key of ["platform", "repo", "both", "agreed", "same"]) {
      await db.insert(schema.projectTranslations).values({
        organizationId: organization.id,
        projectId: project.id,
        translationKeyId: keys.get(key)!.id,
        targetLocale: "fr-FR",
        text: "Traduit",
        status: "approved",
      });
    }

    const second = await syncSnapshot({
      organizationId: organization.id,
      projectId: project.id,
      runId: "run_on_2",
      entries: [
        { key: "platform", text: "Platform v1" },
        { key: "repo", text: "Repo v2" },
        { key: "both", text: "Both edited in the repo" },
        { key: "agreed", text: "Agreed v2" },
        { key: "same", text: "Same" },
      ],
    });
    expect(second.result).toEqual({
      status: "ingested",
      syncReport: { clashes: ["both"], missingKeys: [] },
    });
    const after = await keysByName(first.fileId);
    expect(after.get("platform")).toMatchObject({
      sourceText: "Platform edited here",
      importedSourceText: "Platform v1",
    });
    expect(after.get("repo")).toMatchObject({
      sourceText: "Repo v2",
      importedSourceText: "Repo v2",
    });
    // A clash keeps its base, so the next import reports it again until one side gives way.
    expect(after.get("both")).toMatchObject({
      sourceText: "Both edited here",
      importedSourceText: "Both v1",
    });
    expect(after.get("agreed")).toMatchObject({
      sourceText: "Agreed v2",
      importedSourceText: "Agreed v2",
    });

    // Only the key whose source text was written goes back to review.
    const translations = await db
      .select({
        translationKeyId: schema.projectTranslations.translationKeyId,
        status: schema.projectTranslations.status,
      })
      .from(schema.projectTranslations)
      .where(eq(schema.projectTranslations.projectId, project.id));
    const statusByKey = new Map(
      translations.map((row) => [
        [...after.values()].find((key) => key.id === row.translationKeyId)?.key,
        row.status,
      ]),
    );
    expect(statusByKey.get("repo")).toBe("needs_review");
    for (const key of ["platform", "both", "agreed", "same"]) {
      expect(statusByKey.get(key)).toBe("approved");
    }

    const third = await syncSnapshot({
      organizationId: organization.id,
      projectId: project.id,
      runId: "run_on_3",
      entries: [
        { key: "platform", text: "Platform v1" },
        { key: "repo", text: "Repo v2" },
        { key: "both", text: "Both edited in the repo" },
        { key: "agreed", text: "Agreed v2" },
        { key: "same", text: "Same" },
      ],
    });
    expect(third.result).toEqual({
      status: "ingested",
      syncReport: { clashes: ["both"], missingKeys: [] },
    });
  });

  it("keeps clashes from any upload, and a hand upload still deletes what it lacks", async () => {
    const { organization, project } = await createStoredProjectFixture();
    await db
      .update(schema.projects)
      .set({ sourceTextEditable: true })
      .where(eq(schema.projects.id, project.id));
    const first = await syncSnapshot({
      organizationId: organization.id,
      projectId: project.id,
      runId: "run_mixed_1",
      entries: [
        { key: "clash", text: "v1" },
        { key: "gone", text: "Gone" },
      ],
    });
    const keys = await keysByName(first.fileId);
    await db
      .update(schema.projectTranslationKeys)
      .set({ sourceText: "edited here" })
      .where(eq(schema.projectTranslationKeys.id, keys.get("clash")!.id));

    const version = await createSourceVersion({
      organizationId: organization.id,
      projectId: project.id,
      ingestState: "ingesting",
      ingestWorkflowRunId: "run_mixed_2",
    });
    const result = await reconcileSourceFileTranslationKeys({
      organizationId: organization.id,
      projectId: project.id,
      repositorySourceFileId: version.repositorySourceFileId,
      sourceFileVersionId: version.id,
      workflowRunId: "run_mixed_2",
      entries: [{ key: "clash", text: "v2", context: null }],
    });
    expect(result).toEqual({
      status: "ingested",
      syncReport: { clashes: ["clash"], missingKeys: [] },
    });
    const after = await keysByName(first.fileId);
    expect(after.get("gone")).toBeUndefined();
    expect(after.get("clash")).toMatchObject({ sourceText: "edited here" });
  });
});
