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
import { importApprovedProjectTranslationsFromEntries } from "@/lib/projects/translations/project-translation-service";
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
  keepApprovedTranslations?: boolean;
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
    keepApprovedTranslations: input.keepApprovedTranslations,
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
    options: { keepApprovedTranslations?: boolean } = {},
  ) {
    const version = await createSourceVersion({
      organizationId,
      projectId,
      sourcePath,
      ingestState: "ingesting",
      ingestWorkflowRunId: "run_reconcile",
      keepApprovedTranslations: options.keepApprovedTranslations,
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

  async function reimportWithApprovedTranslations(input: {
    setting?: "stay_approved" | "needs_review";
    keepApprovedTranslations?: boolean;
    lockedLocale?: string;
  }) {
    const { organization, project } = await createStoredProjectFixture();
    if (input.setting) {
      await db
        .update(schema.projects)
        .set({ approvedTranslationsOnSourceChange: input.setting })
        .where(eq(schema.projects.id, project.id));
    }
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
    if (input.lockedLocale) {
      await db.insert(schema.projectContentEditorSegmentLocks).values({
        organizationId: organization.id,
        projectId: project.id,
        targetLocale: input.lockedLocale,
        externalStringId: keyId("changed"),
      });
    }

    await snapshot(
      organization.id,
      project.id,
      [
        { key: "changed", text: "Save changes" },
        { key: "same", text: "Cancel" },
      ],
      SOURCE_PATH,
      { keepApprovedTranslations: input.keepApprovedTranslations },
    );

    const translations = await db
      .select()
      .from(schema.projectTranslations)
      .where(eq(schema.projectTranslations.projectId, project.id));
    const state = (key: string, locale: string) =>
      translations.find(
        (row) => row.translationKeyId === keyId(key) && row.targetLocale === locale,
      );
    const revisions = await db
      .select()
      .from(schema.projectTranslationRevisions)
      .where(eq(schema.projectTranslationRevisions.projectId, project.id));
    return { state, revisions, reviewedAt };
  }

  it("keeps approved translations approved by default when source text changes", async () => {
    const { state, revisions, reviewedAt } = await reimportWithApprovedTranslations({});
    expect(state("changed", "fr")).toMatchObject({ status: "approved", reviewedAt });
    expect(revisions).toEqual([]);
  });

  it("sends approved translations of changed source text back to review when the project asks", async () => {
    const { state, revisions, reviewedAt } = await reimportWithApprovedTranslations({
      setting: "needs_review",
    });
    expect(state("changed", "fr")).toMatchObject({
      status: "needs_review",
      text: "changed fr",
      reviewedAt: null,
    });
    expect(state("changed", "de")).toMatchObject({ status: "draft" });
    expect(state("same", "fr")).toMatchObject({ status: "approved", reviewedAt });
    expect(
      revisions
        .toSorted((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map((row) => [row.translationId, row.status, row.actorKind]),
    ).toEqual([
      [state("changed", "fr")!.id, "approved", "system"],
      [state("changed", "fr")!.id, "needs_review", "system"],
    ]);
  });

  it("leaves a locked translation approved when source text changes", async () => {
    const { state, reviewedAt } = await reimportWithApprovedTranslations({
      setting: "needs_review",
      lockedLocale: "fr",
    });
    expect(state("changed", "fr")).toMatchObject({ status: "approved", reviewedAt });
  });

  it("scopes a lock to its own locale", async () => {
    const { state } = await reimportWithApprovedTranslations({
      setting: "needs_review",
      lockedLocale: "de",
    });
    expect(state("changed", "fr")).toMatchObject({ status: "needs_review" });
  });

  it("does not count surrounding whitespace as a source change", async () => {
    const { organization, project } = await createStoredProjectFixture();
    await db
      .update(schema.projects)
      .set({ approvedTranslationsOnSourceChange: "needs_review" })
      .where(eq(schema.projects.id, project.id));
    await snapshot(organization.id, project.id, [{ key: "total", text: "Total:" }]);
    const [key] = await db
      .select()
      .from(schema.projectTranslationKeys)
      .where(eq(schema.projectTranslationKeys.projectId, project.id));
    await db.insert(schema.projectTranslations).values({
      organizationId: organization.id,
      projectId: project.id,
      translationKeyId: key!.id,
      targetLocale: "fr",
      text: "Total :",
      status: "approved",
      provenance: "import",
    });

    await snapshot(organization.id, project.id, [{ key: "total", text: "Total: " }]);

    const [translation] = await db
      .select()
      .from(schema.projectTranslations)
      .where(eq(schema.projectTranslations.translationKeyId, key!.id));
    expect(translation).toMatchObject({ status: "approved" });
  });

  it("keeps approved translations approved when the upload is marked as a small fix", async () => {
    const { state, revisions, reviewedAt } = await reimportWithApprovedTranslations({
      setting: "needs_review",
      keepApprovedTranslations: true,
    });
    expect(state("changed", "fr")).toMatchObject({ status: "approved", reviewedAt });
    expect(revisions).toEqual([]);
  });

  it("leaves translations in review when an import brings back their unchanged text", async () => {
    const { state } = await reimportWithApprovedTranslations({ setting: "needs_review" });
    const fr = state("changed", "fr")!;

    const unchanged = await importApprovedProjectTranslationsFromEntries({
      organizationId: fr.organizationId,
      projectId: fr.projectId,
      sourcePath: SOURCE_PATH,
      targetLocale: "fr",
      entries: { changed: "changed fr" },
    });
    expect(unchanged).toMatchObject({ imported: 1, skipped: 0 });
    const [afterUnchanged] = await db
      .select()
      .from(schema.projectTranslations)
      .where(eq(schema.projectTranslations.id, fr.id));
    expect(afterUnchanged).toMatchObject({ status: "needs_review", text: "changed fr" });

    const [project] = await db
      .select({ createdByUserId: schema.projects.createdByUserId })
      .from(schema.projects)
      .where(eq(schema.projects.id, fr.projectId));
    const byPerson = await importApprovedProjectTranslationsFromEntries({
      organizationId: fr.organizationId,
      projectId: fr.projectId,
      sourcePath: SOURCE_PATH,
      targetLocale: "fr",
      entries: { changed: "changed fr" },
      actorUserId: project!.createdByUserId,
    });
    expect(byPerson).toMatchObject({ imported: 1 });
    const [afterPerson] = await db
      .select()
      .from(schema.projectTranslations)
      .where(eq(schema.projectTranslations.id, fr.id));
    expect(afterPerson).toMatchObject({ status: "approved", text: "changed fr" });

    await db
      .update(schema.projectTranslations)
      .set({ status: "needs_review" })
      .where(eq(schema.projectTranslations.id, fr.id));
    await importApprovedProjectTranslationsFromEntries({
      organizationId: fr.organizationId,
      projectId: fr.projectId,
      sourcePath: SOURCE_PATH,
      targetLocale: "fr",
      entries: { changed: "Enregistrer les modifications" },
    });
    const [afterEdited] = await db
      .select()
      .from(schema.projectTranslations)
      .where(eq(schema.projectTranslations.id, fr.id));
    expect(afterEdited).toMatchObject({
      status: "approved",
      text: "Enregistrer les modifications",
    });
  });

  it("sends more approved translations to review than one statement can bind", async () => {
    const { organization, project } = await createStoredProjectFixture();
    await db
      .update(schema.projects)
      .set({ approvedTranslationsOnSourceChange: "needs_review" })
      .where(eq(schema.projects.id, project.id));
    // 520 keys in 11 locales: 5,720 revisions at 12 values each would exceed Postgres's 65,535.
    const locales = Array.from({ length: 11 }, (_, index) => `x${index}`);
    const entries = Array.from({ length: 520 }, (_, index) => ({
      key: `k${index}`,
      text: `Text ${index}`,
    }));
    await snapshot(organization.id, project.id, entries);
    const keys = await db
      .select({ id: schema.projectTranslationKeys.id })
      .from(schema.projectTranslationKeys)
      .where(eq(schema.projectTranslationKeys.projectId, project.id));
    const rows = keys.flatMap((key) =>
      locales.map((targetLocale) => ({
        organizationId: organization.id,
        projectId: project.id,
        translationKeyId: key.id,
        targetLocale,
        text: "t",
        status: "approved" as const,
        provenance: "import" as const,
      })),
    );
    for (let start = 0; start < rows.length; start += 1000) {
      await db.insert(schema.projectTranslations).values(rows.slice(start, start + 1000));
    }

    await snapshot(
      organization.id,
      project.id,
      entries.map((entry) => ({ ...entry, text: `${entry.text}!` })),
    );

    const statuses = await db
      .select({ status: schema.projectTranslations.status })
      .from(schema.projectTranslations)
      .where(eq(schema.projectTranslations.projectId, project.id));
    expect(statuses).toHaveLength(rows.length);
    expect(new Set(statuses.map((row) => row.status))).toEqual(new Set(["needs_review"]));
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
