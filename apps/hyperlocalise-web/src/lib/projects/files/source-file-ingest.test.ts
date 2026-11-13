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

import { and, desc, eq } from "drizzle-orm";
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

import { GITLAB_CONTENT_SYNC_UPLOAD_SURFACE } from "@/lib/agents/content-sync/content-sync-types";
import { hideKeysMissingFromSync } from "./hide-keys-missing-from-sync";
import { reconcileSourceFileTranslationKeys } from "./reconcile-source-file-translation-keys";
import { settleUnchangedSourceFile } from "./settle-unchanged-source-file";
import { SYNC_REPORT_KEY_LIMIT } from "./source-file-sync-report";
import { applyProjectSourceText } from "./source-text-editing";
import { TRANSLATION_AS_SOURCE_UPLOAD_SURFACE } from "./translation-as-source-support";

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
    uploadSurface: input.uploadSurface ?? "test",
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

describe("reconcileSourceFileTranslationKeys for a GitLab sync", () => {
  async function syncSnapshot(input: {
    organizationId: string;
    projectId: string;
    entries: { key: string; text: string }[];
    runId: string;
    uploadSurface?: string;
  }) {
    const version = await createSourceVersion({
      organizationId: input.organizationId,
      projectId: input.projectId,
      ingestState: "ingesting",
      ingestWorkflowRunId: input.runId,
      uploadSurface: input.uploadSurface ?? GITLAB_CONTENT_SYNC_UPLOAD_SURFACE,
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
      syncReport: { missingKeys: [] },
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
      syncReport: { missingKeys: ["dropped"] },
    });
    expect(second.storedReport).toEqual({ missingKeys: ["dropped"] });
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
      syncReport: { missingKeys: [] },
    });
    keys = await keysByName(first.fileId);
    expect(keys.get("dropped")).toMatchObject({ isHidden: false, hiddenBySyncAt: null });
    expect(keys.get("manual")).toMatchObject({ isHidden: true, hiddenBySyncAt: null });
  });

  it("hides, and later shows again, keys a file built from translations no longer has", async () => {
    const { organization, project } = await createStoredProjectFixture();
    const send = (runId: string, keys: string[]) =>
      syncSnapshot({
        organizationId: organization.id,
        projectId: project.id,
        runId,
        uploadSurface: TRANSLATION_AS_SOURCE_UPLOAD_SURFACE,
        entries: keys.map((key) => ({ key, text: key })),
      });

    const first = await send("run_sent_1", ["keep", "dropped"]);
    const dropped = (await keysByName(first.fileId)).get("dropped")!;
    await db.insert(schema.projectTranslations).values({
      organizationId: organization.id,
      projectId: project.id,
      translationKeyId: dropped.id,
      targetLocale: "de",
      text: "Entfernt",
      status: "approved",
    });

    const second = await send("run_sent_2", ["keep"]);
    expect(second.storedReport).toEqual({ missingKeys: ["dropped"] });
    expect((await keysByName(first.fileId)).get("dropped")).toMatchObject({
      id: dropped.id,
      isHidden: true,
    });

    await send("run_sent_3", ["keep", "dropped"]);
    expect((await keysByName(first.fileId)).get("dropped")).toMatchObject({
      id: dropped.id,
      isHidden: false,
      hiddenBySyncAt: null,
    });
    const translations = await db
      .select({ text: schema.projectTranslations.text, status: schema.projectTranslations.status })
      .from(schema.projectTranslations)
      .where(eq(schema.projectTranslations.translationKeyId, dropped.id));
    expect(translations).toEqual([{ text: "Entfernt", status: "approved" }]);
  });

  it("replaces source text edited in the platform while the setting is off", async () => {
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
      syncReport: { missingKeys: [] },
    });
    expect((await keysByName(first.fileId)).get("title")).toMatchObject({
      sourceText: "Home",
      importedSourceText: "Home",
    });
  });

  async function editSourceText(id: string, sourceText: string) {
    await db
      .update(schema.projectTranslationKeys)
      .set({ sourceText })
      .where(eq(schema.projectTranslationKeys.id, id));
  }

  async function turnOnSourceTextEditing(
    projectId: string,
    approvedTranslationsOnSourceChange: "stay_approved" | "needs_review" = "stay_approved",
  ) {
    await db
      .update(schema.projects)
      .set({ sourceTextEditable: true, approvedTranslationsOnSourceChange })
      .where(eq(schema.projects.id, projectId));
  }

  it("keeps platform edits, takes file edits and reports clashes while the setting is on", async () => {
    const { organization, project } = await createStoredProjectFixture();
    await turnOnSourceTextEditing(project.id, "needs_review");
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
    await editSourceText(keys.get("platform")!.id, "Platform edited here");
    await editSourceText(keys.get("both")!.id, "Both edited here");
    await editSourceText(keys.get("agreed")!.id, "Agreed v2");
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

    const entries = [
      { key: "platform", text: "Platform v1" },
      { key: "repo", text: "Repo v2" },
      { key: "both", text: "Both edited in the repo" },
      { key: "agreed", text: "Agreed v2" },
      { key: "same", text: "Same" },
    ];
    const second = await syncSnapshot({
      organizationId: organization.id,
      projectId: project.id,
      runId: "run_on_2",
      entries,
    });
    expect(second.result).toEqual({
      status: "ingested",
      syncReport: {
        clashes: [{ key: "both", fileText: "Both edited in the repo" }],
        missingKeys: [],
      },
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

    // Only the key whose source text the import wrote goes back to review.
    const translations = await db
      .select({
        translationKeyId: schema.projectTranslations.translationKeyId,
        status: schema.projectTranslations.status,
      })
      .from(schema.projectTranslations)
      .where(eq(schema.projectTranslations.projectId, project.id));
    const keyById = new Map([...after.values()].map((row) => [row.id, row.key]));
    const statusByKey = new Map(
      translations.map((row) => [keyById.get(row.translationKeyId), row.status]),
    );
    expect(statusByKey.get("repo")).toBe("needs_review");
    for (const key of ["platform", "both", "agreed", "same"]) {
      expect(statusByKey.get(key)).toBe("approved");
    }

    const third = await syncSnapshot({
      organizationId: organization.id,
      projectId: project.id,
      runId: "run_on_3",
      entries,
    });
    expect(third.result).toEqual({
      status: "ingested",
      syncReport: {
        clashes: [{ key: "both", fileText: "Both edited in the repo" }],
        missingKeys: [],
      },
    });
  });

  it("takes the file's text for a key from before the last import was kept", async () => {
    const { organization, project } = await createStoredProjectFixture();
    await turnOnSourceTextEditing(project.id);
    const first = await syncSnapshot({
      organizationId: organization.id,
      projectId: project.id,
      runId: "run_base_1",
      entries: [{ key: "title", text: "Old" }],
    });
    const title = (await keysByName(first.fileId)).get("title")!;
    await db
      .update(schema.projectTranslationKeys)
      .set({ importedSourceText: null })
      .where(eq(schema.projectTranslationKeys.id, title.id));

    await syncSnapshot({
      organizationId: organization.id,
      projectId: project.id,
      runId: "run_base_2",
      entries: [{ key: "title", text: "New" }],
    });
    expect((await keysByName(first.fileId)).get("title")).toMatchObject({
      sourceText: "New",
      importedSourceText: "New",
    });
  });

  it("keeps a hand upload's clashes, and a hand upload still deletes what it lacks", async () => {
    const { organization, project } = await createStoredProjectFixture();
    await turnOnSourceTextEditing(project.id);
    const first = await syncSnapshot({
      organizationId: organization.id,
      projectId: project.id,
      runId: "run_hand_clash_1",
      entries: [
        { key: "clash", text: "v1" },
        { key: "gone", text: "Gone" },
      ],
    });
    await editSourceText((await keysByName(first.fileId)).get("clash")!.id, "edited here");

    const version = await createSourceVersion({
      organizationId: organization.id,
      projectId: project.id,
      ingestState: "ingesting",
      ingestWorkflowRunId: "run_hand_clash_2",
    });
    const result = await reconcileSourceFileTranslationKeys({
      organizationId: organization.id,
      projectId: project.id,
      repositorySourceFileId: version.repositorySourceFileId,
      sourceFileVersionId: version.id,
      workflowRunId: "run_hand_clash_2",
      entries: [{ key: "clash", text: "v2", context: null }],
    });
    expect(result).toEqual({
      status: "ingested",
      syncReport: { clashes: [{ key: "clash", fileText: "v2" }], missingKeys: [] },
    });
    const after = await keysByName(first.fileId);
    expect(after.get("gone")).toBeUndefined();
    expect(after.get("clash")).toMatchObject({ sourceText: "edited here" });
  });

  it("stores no report for a hand upload, which still deletes what it lacks", async () => {
    const { organization, project } = await createStoredProjectFixture();
    const first = await syncSnapshot({
      organizationId: organization.id,
      projectId: project.id,
      runId: "run_mixed_1",
      entries: [
        { key: "kept", text: "v1" },
        { key: "gone", text: "Gone" },
      ],
    });

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
      entries: [{ key: "kept", text: "v2", context: null }],
    });
    expect(result).toEqual({ status: "ingested" });
    const after = await keysByName(first.fileId);
    expect(after.get("gone")).toBeUndefined();
    expect(after.get("kept")).toMatchObject({ sourceText: "v2" });
  });

  it("shows keys a sync hid again when a hand upload brings them back", async () => {
    const { organization, project } = await createStoredProjectFixture();
    const first = await syncSnapshot({
      organizationId: organization.id,
      projectId: project.id,
      runId: "run_hand_1",
      entries: [{ key: "back", text: "Back" }],
    });
    await syncSnapshot({
      organizationId: organization.id,
      projectId: project.id,
      runId: "run_hand_2",
      entries: [],
    });
    expect((await keysByName(first.fileId)).get("back")).toMatchObject({ isHidden: true });

    const version = await createSourceVersion({
      organizationId: organization.id,
      projectId: project.id,
      ingestState: "ingesting",
      ingestWorkflowRunId: "run_hand_3",
    });
    await reconcileSourceFileTranslationKeys({
      organizationId: organization.id,
      projectId: project.id,
      repositorySourceFileId: version.repositorySourceFileId,
      sourceFileVersionId: version.id,
      workflowRunId: "run_hand_3",
      entries: [{ key: "back", text: "Back", context: null }],
    });
    expect((await keysByName(first.fileId)).get("back")).toMatchObject({
      isHidden: false,
      hiddenBySyncAt: null,
    });
  });

  it("stores a count when ingest hides more keys than the report keeps", async () => {
    const { organization, project } = await createStoredProjectFixture();
    const keys = Array.from({ length: SYNC_REPORT_KEY_LIMIT + 1 }, (_, index) => ({
      key: `key-${index}`,
      text: `Text ${index}`,
    }));
    const first = await syncSnapshot({
      organizationId: organization.id,
      projectId: project.id,
      runId: "run_trunc_1",
      entries: keys,
    });
    expect(first.result).toEqual({ status: "ingested", syncReport: { missingKeys: [] } });

    const second = await syncSnapshot({
      organizationId: organization.id,
      projectId: project.id,
      runId: "run_trunc_2",
      entries: [],
    });
    const missingKeys = keys.map((entry) => entry.key).sort();
    expect(second.result).toEqual({
      status: "ingested",
      syncReport: {
        missingKeys: missingKeys.slice(0, SYNC_REPORT_KEY_LIMIT),
        missingKeyCount: missingKeys.length,
      },
    });
    expect(second.storedReport).toEqual({
      missingKeys: missingKeys.slice(0, SYNC_REPORT_KEY_LIMIT),
      missingKeyCount: missingKeys.length,
    });
  });

  it("hides every visible key of a dropped file and leaves hand-hidden keys alone", async () => {
    const { organization, project } = await createStoredProjectFixture();
    const first = await syncSnapshot({
      organizationId: organization.id,
      projectId: project.id,
      runId: "run_drop_1",
      entries: [
        { key: "keep", text: "Keep" },
        { key: "dropped", text: "Dropped" },
        { key: "manual", text: "Manual" },
      ],
    });
    const manual = (await keysByName(first.fileId)).get("manual")!;
    await db
      .update(schema.projectTranslationKeys)
      .set({ isHidden: true })
      .where(eq(schema.projectTranslationKeys.id, manual.id));

    await expect(
      hideKeysMissingFromSync(db, {
        organizationId: organization.id,
        projectId: project.id,
        repositorySourceFileId: first.fileId,
      }),
    ).resolves.toEqual(["dropped", "keep"]);

    const keys = await keysByName(first.fileId);
    expect(keys.get("keep")).toMatchObject({ isHidden: true });
    expect(keys.get("keep")?.hiddenBySyncAt).not.toBeNull();
    expect(keys.get("dropped")).toMatchObject({ isHidden: true });
    expect(keys.get("dropped")?.hiddenBySyncAt).not.toBeNull();
    expect(keys.get("manual")).toMatchObject({ isHidden: true, hiddenBySyncAt: null });
  });
});

describe("settleUnchangedSourceFile", () => {
  async function importedFile(input: {
    organizationId: string;
    projectId: string;
    runId: string;
    entries: { key: string; text: string }[];
  }) {
    const version = await createSourceVersion({
      organizationId: input.organizationId,
      projectId: input.projectId,
      ingestState: "ingesting",
      ingestWorkflowRunId: input.runId,
      uploadSurface: GITLAB_CONTENT_SYNC_UPLOAD_SURFACE,
    });
    await reconcileSourceFileTranslationKeys({
      organizationId: input.organizationId,
      projectId: input.projectId,
      repositorySourceFileId: version.repositorySourceFileId,
      sourceFileVersionId: version.id,
      workflowRunId: input.runId,
      entries: input.entries.map((entry) => ({ ...entry, context: null })),
    });
    return version;
  }

  async function keyRows(fileId: string) {
    const rows = await db
      .select({
        key: schema.projectTranslationKeys.key,
        sourceText: schema.projectTranslationKeys.sourceText,
        importedSourceText: schema.projectTranslationKeys.importedSourceText,
        updatedAt: schema.projectTranslationKeys.updatedAt,
        id: schema.projectTranslationKeys.id,
      })
      .from(schema.projectTranslationKeys)
      .where(eq(schema.projectTranslationKeys.repositorySourceFileId, fileId));
    return new Map(rows.map((row) => [row.key, row]));
  }

  async function setSourceText(id: string, sourceText: string) {
    await db
      .update(schema.projectTranslationKeys)
      .set({ sourceText })
      .where(eq(schema.projectTranslationKeys.id, id));
  }

  async function setProject(
    projectId: string,
    values: Partial<typeof schema.projects.$inferInsert>,
  ) {
    await db.update(schema.projects).set(values).where(eq(schema.projects.id, projectId));
  }

  async function storedReport(fileId: string) {
    const [stored] = await db
      .select({ syncReport: schema.repositorySourceFileVersions.syncReport })
      .from(schema.repositorySourceFileVersions)
      .where(eq(schema.repositorySourceFileVersions.repositorySourceFileId, fileId))
      .orderBy(desc(schema.repositorySourceFileVersions.createdAt))
      .limit(1);
    return stored?.syncReport;
  }

  it("settles a standing clash either way the project resolves it", async () => {
    const { organization, project } = await createStoredProjectFixture();
    await setProject(project.id, { sourceTextEditable: true });
    const first = await importedFile({
      organizationId: organization.id,
      projectId: project.id,
      runId: "run_settle_1",
      entries: [
        { key: "agree", text: "v1" },
        { key: "revert", text: "v1" },
        { key: "stand", text: "v1" },
      ],
    });
    let keys = await keyRows(first.repositorySourceFileId);
    for (const key of ["agree", "revert", "stand"]) {
      await setSourceText(keys.get(key)!.id, "edited here");
    }
    await importedFile({
      organizationId: organization.id,
      projectId: project.id,
      runId: "run_settle_2",
      entries: [
        { key: "agree", text: "v2" },
        { key: "revert", text: "v2" },
        { key: "stand", text: "v2" },
      ],
    });
    const settle = () =>
      settleUnchangedSourceFile({
        organizationId: organization.id,
        projectId: project.id,
        sourcePath: SOURCE_PATH,
      });
    expect((await settle()).map((clash) => clash.key).sort()).toEqual(["agree", "revert", "stand"]);

    keys = await keyRows(first.repositorySourceFileId);
    await setSourceText(keys.get("agree")!.id, "v2");
    await setSourceText(keys.get("revert")!.id, "v1");

    expect((await settle()).map((clash) => clash.key)).toEqual(["stand"]);
    keys = await keyRows(first.repositorySourceFileId);
    expect(keys.get("agree")).toMatchObject({ sourceText: "v2", importedSourceText: "v2" });
    expect(keys.get("revert")).toMatchObject({ sourceText: "v2", importedSourceText: "v2" });
    expect(keys.get("stand")).toMatchObject({
      sourceText: "edited here",
      importedSourceText: "v1",
    });
    const report = await storedReport(first.repositorySourceFileId);
    expect(report?.clashes).toEqual([{ key: "stand", fileText: "v2" }]);
    expect(report?.missingKeys).toEqual([]);
  });

  it("leaves a key it revisits without changing it as it was", async () => {
    const { organization, project } = await createStoredProjectFixture();
    await setProject(project.id, { sourceTextEditable: true });
    const first = await importedFile({
      organizationId: organization.id,
      projectId: project.id,
      runId: "run_touch_1",
      entries: [{ key: "stand", text: "v1" }],
    });
    let keys = await keyRows(first.repositorySourceFileId);
    await setSourceText(keys.get("stand")!.id, "edited here");
    await importedFile({
      organizationId: organization.id,
      projectId: project.id,
      runId: "run_touch_2",
      entries: [{ key: "stand", text: "v2" }],
    });
    keys = await keyRows(first.repositorySourceFileId);
    const before = keys.get("stand")!.updatedAt;

    await settleUnchangedSourceFile({
      organizationId: organization.id,
      projectId: project.id,
      sourcePath: SOURCE_PATH,
    });
    expect((await keyRows(first.repositorySourceFileId)).get("stand")?.updatedAt).toEqual(before);
  });

  it("takes the file's text for a clash once the setting is turned off", async () => {
    const { organization, project } = await createStoredProjectFixture();
    await setProject(project.id, { sourceTextEditable: true });
    const first = await importedFile({
      organizationId: organization.id,
      projectId: project.id,
      runId: "run_off_after_1",
      entries: [{ key: "clash", text: "v1" }],
    });
    let keys = await keyRows(first.repositorySourceFileId);
    await setSourceText(keys.get("clash")!.id, "edited here");
    await importedFile({
      organizationId: organization.id,
      projectId: project.id,
      runId: "run_off_after_2",
      entries: [{ key: "clash", text: "v2" }],
    });
    await setProject(project.id, { sourceTextEditable: false });

    expect(
      await settleUnchangedSourceFile({
        organizationId: organization.id,
        projectId: project.id,
        sourcePath: SOURCE_PATH,
      }),
    ).toEqual([]);
    keys = await keyRows(first.repositorySourceFileId);
    expect(keys.get("clash")).toMatchObject({ sourceText: "v2", importedSourceText: "v2" });
    expect((await storedReport(first.repositorySourceFileId))?.clashes).toBeUndefined();
  });

  it("puts the file's text back while the setting is off, sending translations to review", async () => {
    const { organization, project } = await createStoredProjectFixture();
    await setProject(project.id, { approvedTranslationsOnSourceChange: "needs_review" });
    const first = await importedFile({
      organizationId: organization.id,
      projectId: project.id,
      runId: "run_settle_off",
      entries: [
        { key: "drifted", text: "Repo" },
        { key: "same", text: "Same" },
      ],
    });
    let keys = await keyRows(first.repositorySourceFileId);
    await setSourceText(keys.get("drifted")!.id, "edited here");
    await db.insert(schema.projectTranslations).values({
      organizationId: organization.id,
      projectId: project.id,
      translationKeyId: keys.get("drifted")!.id,
      targetLocale: "fr-FR",
      text: "Traduit",
      status: "approved",
    });

    expect(
      await settleUnchangedSourceFile({
        organizationId: organization.id,
        projectId: project.id,
        sourcePath: SOURCE_PATH,
      }),
    ).toEqual([]);
    keys = await keyRows(first.repositorySourceFileId);
    expect(keys.get("drifted")).toMatchObject({ sourceText: "Repo", importedSourceText: "Repo" });
    const [translation] = await db
      .select({ status: schema.projectTranslations.status })
      .from(schema.projectTranslations)
      .where(eq(schema.projectTranslations.translationKeyId, keys.get("drifted")!.id));
    expect(translation?.status).toBe("needs_review");
  });

  it("keeps edits made here while the setting is on", async () => {
    const { organization, project } = await createStoredProjectFixture();
    await setProject(project.id, { sourceTextEditable: true });
    const first = await importedFile({
      organizationId: organization.id,
      projectId: project.id,
      runId: "run_settle_on",
      entries: [{ key: "edited", text: "Repo" }],
    });
    let keys = await keyRows(first.repositorySourceFileId);
    await setSourceText(keys.get("edited")!.id, "edited here");

    expect(
      await settleUnchangedSourceFile({
        organizationId: organization.id,
        projectId: project.id,
        sourcePath: SOURCE_PATH,
      }),
    ).toEqual([]);
    keys = await keyRows(first.repositorySourceFileId);
    expect(keys.get("edited")).toMatchObject({
      sourceText: "edited here",
      importedSourceText: "Repo",
    });
  });
});

describe("applyProjectSourceText", () => {
  it("writes source text edited in the project into the file, for a project that allows it", async () => {
    const { organization, project } = await createStoredProjectFixture();
    const version = await createSourceVersion({
      organizationId: organization.id,
      projectId: project.id,
      ingestState: "ingesting",
      ingestWorkflowRunId: "run_apply_1",
      uploadSurface: GITLAB_CONTENT_SYNC_UPLOAD_SURFACE,
    });
    await reconcileSourceFileTranslationKeys({
      organizationId: organization.id,
      projectId: project.id,
      repositorySourceFileId: version.repositorySourceFileId,
      sourceFileVersionId: version.id,
      workflowRunId: "run_apply_1",
      entries: [
        { key: "title", text: "Home", context: null },
        { key: "hidden", text: "Hidden", context: null },
        { key: "cta", text: "Buy", context: null },
      ],
    });
    const rows = await db
      .select({ id: schema.projectTranslationKeys.id, key: schema.projectTranslationKeys.key })
      .from(schema.projectTranslationKeys)
      .where(
        eq(schema.projectTranslationKeys.repositorySourceFileId, version.repositorySourceFileId),
      );
    const idOf = (key: string) => rows.find((row) => row.key === key)!.id;
    await db
      .update(schema.projectTranslationKeys)
      .set({ sourceText: "Welcome" })
      .where(eq(schema.projectTranslationKeys.id, idOf("title")));
    await db
      .update(schema.projectTranslationKeys)
      .set({ sourceText: "Hidden edit", isHidden: true })
      .where(eq(schema.projectTranslationKeys.id, idOf("hidden")));
    // No text last imported: not known to be an edit made here.
    await db
      .update(schema.projectTranslationKeys)
      .set({ sourceText: "Buy now", importedSourceText: null })
      .where(eq(schema.projectTranslationKeys.id, idOf("cta")));
    const content = Buffer.from(
      '{\n  "title": "Home",\n  "hidden": "Hidden",\n  "cta": "Buy"\n}\n',
    );
    const apply = () =>
      applyProjectSourceText({
        organizationId: organization.id,
        projectId: project.id,
        sourcePath: SOURCE_PATH,
        content,
      });

    expect((await apply()).written).toEqual([]);

    await db
      .update(schema.projects)
      .set({ sourceTextEditable: true })
      .where(eq(schema.projects.id, project.id));
    const applied = await apply();
    expect(applied.written).toEqual(["title"]);
    expect(applied.content.toString("utf8")).toBe(
      '{\n  "title": "Welcome",\n  "hidden": "Hidden",\n  "cta": "Buy"\n}\n',
    );
    expect(
      (
        await applyProjectSourceText({
          organizationId: organization.id,
          projectId: project.id,
          sourcePath: "locales/en.yaml",
          content,
        })
      ).written,
    ).toEqual([]);
  });

  it("leaves a list item that clashes as the file has it, for jobs and delivery alike", async () => {
    const { organization, project } = await createStoredProjectFixture();
    await db
      .update(schema.projects)
      .set({ sourceTextEditable: true })
      .where(eq(schema.projects.id, project.id));
    const version = await createSourceVersion({
      organizationId: organization.id,
      projectId: project.id,
      ingestState: "ingesting",
      ingestWorkflowRunId: "run_apply_list",
      uploadSurface: GITLAB_CONTENT_SYNC_UPLOAD_SURFACE,
    });
    await reconcileSourceFileTranslationKeys({
      organizationId: organization.id,
      projectId: project.id,
      repositorySourceFileId: version.repositorySourceFileId,
      sourceFileVersionId: version.id,
      workflowRunId: "run_apply_list",
      entries: [
        { key: "items[0]", text: "A", context: null },
        { key: "items[1]", text: "B", context: null },
        { key: "Price [USD]", text: "Price", context: null },
      ],
    });
    for (const [key, text] of [
      ["items[0]", "A edited"],
      ["items[1]", "B edited"],
      ["Price [USD]", "Cost"],
    ] as const) {
      await db
        .update(schema.projectTranslationKeys)
        .set({ sourceText: text })
        .where(
          and(
            eq(schema.projectTranslationKeys.projectId, project.id),
            eq(schema.projectTranslationKeys.key, key),
          ),
        );
    }
    // The repository inserted "X" at the top, so items[1] now holds what was items[0].
    const applied = await applyProjectSourceText({
      organizationId: organization.id,
      projectId: project.id,
      sourcePath: SOURCE_PATH,
      content: Buffer.from('{"items": ["X", "A", "B"], "Price [USD]": "Price in dollars"}'),
    });
    // "Price [USD]" clashes too (the file changed it), but it isn't a list item, so it's written.
    expect(applied.written.sort()).toEqual(["Price [USD]"]);

    const unshifted = await applyProjectSourceText({
      organizationId: organization.id,
      projectId: project.id,
      sourcePath: SOURCE_PATH,
      content: Buffer.from('{"items": ["A", "B"], "Price [USD]": "Price"}'),
    });
    expect(unshifted.content.toString("utf8")).toBe(
      '{"items": ["A edited", "B edited"], "Price [USD]": "Cost"}',
    );
  });
});
