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

const { dispatchWorkspaceAutomationsForSourceUploadMock } = vi.hoisted(() => ({
  dispatchWorkspaceAutomationsForSourceUploadMock: vi.fn(),
}));

vi.mock("@/lib/agents/workspace-automation-dispatcher", () => ({
  dispatchWorkspaceAutomationsForSourceUpload: dispatchWorkspaceAutomationsForSourceUploadMock,
}));

import { createProjectTestFixture } from "@/api/routes/project/project.fixture";
import { insertStoredSourceFile } from "@/api/routes/public-jobs/public-jobs.fixture";
import { db, schema } from "@/lib/database";
import { createRepositorySourceFileVersion } from "@/lib/file-storage/records";
import type { SourceFileIngestQueue } from "@/lib/workflow/types";

import {
  claimSourceFileIngest,
  enqueueSourceFileIngestAfterUpload,
  entriesFromHlOutput,
  hasIngestedSourceHashForPath,
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

describe("hasIngestedSourceHashForPath", () => {
  it("returns false when sourceHash is null", async () => {
    const { organization, project } = await createStoredProjectFixture();
    await createSourceVersion({
      organizationId: organization.id,
      projectId: project.id,
      sourceHash: null,
      ingestState: "ingested",
    });

    await expect(
      hasIngestedSourceHashForPath({
        organizationId: organization.id,
        projectId: project.id,
        sourcePath: SOURCE_PATH,
        sourceHash: null,
      }),
    ).resolves.toBe(false);
  });

  it("returns true for matching ingested and skipped hashes on the same path", async () => {
    const { organization, project } = await createStoredProjectFixture();
    await createSourceVersion({
      organizationId: organization.id,
      projectId: project.id,
      sourcePath: "locales/ingested.json",
      ingestState: "ingested",
      filename: "ingested.json",
    });
    await createSourceVersion({
      organizationId: organization.id,
      projectId: project.id,
      sourcePath: "locales/skipped.json",
      ingestState: "skipped",
      filename: "skipped.json",
    });

    await expect(
      hasIngestedSourceHashForPath({
        organizationId: organization.id,
        projectId: project.id,
        sourcePath: "locales/ingested.json",
        sourceHash: SOURCE_HASH,
      }),
    ).resolves.toBe(true);

    await expect(
      hasIngestedSourceHashForPath({
        organizationId: organization.id,
        projectId: project.id,
        sourcePath: "locales/skipped.json",
        sourceHash: SOURCE_HASH,
      }),
    ).resolves.toBe(true);
  });

  it("ignores pending, failed, and ingesting rows plus hash/path mismatches", async () => {
    const { organization, project } = await createStoredProjectFixture();

    await createSourceVersion({
      organizationId: organization.id,
      projectId: project.id,
      ingestState: "pending",
      filename: "pending.json",
    });
    await createSourceVersion({
      organizationId: organization.id,
      projectId: project.id,
      ingestState: "failed",
      filename: "failed.json",
    });
    await createSourceVersion({
      organizationId: organization.id,
      projectId: project.id,
      ingestState: "ingesting",
      ingestWorkflowRunId: "run_other",
      filename: "ingesting.json",
    });
    await createSourceVersion({
      organizationId: organization.id,
      projectId: project.id,
      sourcePath: "locales/other.json",
      ingestState: "ingested",
      filename: "other-path.json",
    });
    await createSourceVersion({
      organizationId: organization.id,
      projectId: project.id,
      sourceHash: "sha256:different",
      ingestState: "ingested",
      filename: "other-hash.json",
    });

    await expect(
      hasIngestedSourceHashForPath({
        organizationId: organization.id,
        projectId: project.id,
        sourcePath: SOURCE_PATH,
        sourceHash: SOURCE_HASH,
      }),
    ).resolves.toBe(false);
  });
});

describe("enqueueSourceFileIngestAfterUpload", () => {
  it("skips enqueue when the hash was already ingested and still dispatches automations", async () => {
    const { organization, project } = await createStoredProjectFixture();
    await createSourceVersion({
      organizationId: organization.id,
      projectId: project.id,
      ingestState: "ingested",
      filename: "prior.json",
    });
    const pending = await createSourceVersion({
      organizationId: organization.id,
      projectId: project.id,
      ingestState: "pending",
      filename: "duplicate.json",
    });

    const enqueue = vi.fn(async () => ({ ids: ["run_should_not_enqueue"] }));
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

    expect(result).toEqual({ enqueued: false, reason: "hash_already_ingested" });
    expect(enqueue).not.toHaveBeenCalled();

    const [updated] = await db
      .select({
        ingestState: schema.repositorySourceFileVersions.ingestState,
        ingestedAt: schema.repositorySourceFileVersions.ingestedAt,
      })
      .from(schema.repositorySourceFileVersions)
      .where(eq(schema.repositorySourceFileVersions.id, pending.id));

    expect(updated?.ingestState).toBe("skipped");
    expect(updated?.ingestedAt).toBeInstanceOf(Date);

    await vi.waitFor(() => {
      expect(dispatchWorkspaceAutomationsForSourceUploadMock).toHaveBeenCalledWith({
        organizationId: organization.id,
        projectId: project.id,
        sourceFileId: pending.storedFileId,
        sourceFileVersionId: pending.id,
        sourcePath: SOURCE_PATH,
        sourceHash: SOURCE_HASH,
      });
    });
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
