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
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { db, schema } from "@/lib/database/client";
import { uniqueTestProjectIdentifier } from "@/lib/projects/issue-identifier/test-project-identifier";

import { completeAgentRun, createAgentRun, startAgentRun } from "../agent-runs/agent-runs";
import { serializeAgentRunProposalItem } from "./agent-run-proposals";
import { executeProviderAgentWriteback } from "./provider-agent-writeback";

const pushExternalTmsTranslationsMock = vi.hoisted(() => vi.fn());
const pullExternalTmsTaskContentMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/providers/shared/tms-provider-content", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/providers/shared/tms-provider-content")>();
  return {
    ...actual,
    pushExternalTmsTranslations: (...args: unknown[]) => pushExternalTmsTranslationsMock(...args),
    pullExternalTmsTaskContent: (...args: unknown[]) => pullExternalTmsTaskContentMock(...args),
  };
});

async function createTestJob(input: { organizationId: string; projectId: string }) {
  const [job] = await db
    .insert(schema.jobs)
    .values({
      id: `job_test_${randomUUID()}`,
      organizationId: input.organizationId,
      projectId: input.projectId,
      kind: "translation",
      status: "queued",
      inputPayload: {},
    })
    .returning();

  return job!;
}

describe("provider-agent-writeback", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 200 })) as unknown as typeof fetch,
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    pushExternalTmsTranslationsMock.mockReset();
    pullExternalTmsTaskContentMock.mockReset();
  });

  it("pushes accepted proposals and records per-item write-back results", async () => {
    const projectId = randomUUID();
    const orgSuffix = randomUUID();

    const [organization] = await db
      .insert(schema.organizations)
      .values({
        workosOrganizationId: `org_${orgSuffix}`,
        name: "Write-back Org",
        slug: `writeback-${orgSuffix.slice(0, 8)}`,
      })
      .returning();
    const organizationId = organization!.id;

    await db.insert(schema.projects).values({
      id: projectId,
      identifier: uniqueTestProjectIdentifier(),
      organizationId,
      name: "External TMS Project",
      source: "external_tms",
      externalProviderKind: "crowdin",
      externalProjectId: "123",
    });

    const job = await createTestJob({ organizationId, projectId });

    const sourceRun = await createAgentRun({
      organizationId,
      providerKind: "crowdin",
      externalJobId: "task-1",
      kind: "translate",
      hyperlocaliseJobId: job.id,
      inputSnapshot: { projectId },
    });

    await startAgentRun({ runId: sourceRun.id, organizationId });

    await completeAgentRun({
      runId: sourceRun.id,
      organizationId,
      outputSummary: { proposals: 1 },
      changedItems: [
        serializeAgentRunProposalItem({
          itemId: "hash-1:fr-FR",
          externalStringId: "hash-1",
          key: "cta.label",
          locale: "fr-FR",
          sourceText: "Buy now",
          from: "",
          to: "Acheter",
          reviewState: "accepted",
          changedFields: ["target"],
          warnings: {},
          fileId: "101",
        }),
      ],
    });

    const writebackRun = await createAgentRun({
      organizationId,
      providerKind: "crowdin",
      externalJobId: "task-1",
      kind: "translate",
      hyperlocaliseJobId: job.id,
      inputSnapshot: {
        action: "push_approved_changes",
        projectId,
        hyperlocaliseJobId: job.id,
      },
    });

    pushExternalTmsTranslationsMock.mockResolvedValue({
      runId: "sync-run-1",
      status: "succeeded",
      providerKind: "crowdin",
      providerCredentialId: "cred-1",
      projectId,
      counts: {
        translationsRequested: 1,
        translationsUploaded: 1,
        translationsFailed: 0,
        asyncOperations: 0,
      },
      failures: [],
      asyncOperations: [],
    });

    const result = await executeProviderAgentWriteback({
      agentRunId: writebackRun.id,
      organizationId,
    });

    expect(result).toMatchObject({
      ok: true,
      uploaded: 1,
      skipped: 0,
      failed: 0,
      pushRunId: "sync-run-1",
    });

    expect(pushExternalTmsTranslationsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId,
        externalJobId: "task-1",
        translations: [
          expect.objectContaining({
            externalStringId: "hash-1",
            key: "cta.label",
            locale: "fr-FR",
            text: "Acheter",
            fileId: "101",
          }),
        ],
      }),
    );

    const [storedRun] = await db
      .select()
      .from(schema.agentRuns)
      .where(eq(schema.agentRuns.id, writebackRun.id))
      .limit(1);

    expect(storedRun?.status).toBe("succeeded");
    expect(storedRun?.outputSummary).toMatchObject({
      pushRunId: "sync-run-1",
      uploaded: 1,
      failed: 0,
    });
    expect(storedRun?.changedItems).toEqual([
      expect.objectContaining({
        type: "provider_translation_writeback",
        itemId: "hash-1:fr-FR",
        status: "uploaded",
        sourceAgentRunId: sourceRun.id,
      }),
    ]);
  });

  it("completes with partial success when some locales fail", async () => {
    const projectId = randomUUID();
    const orgSuffix = randomUUID();

    const [organization] = await db
      .insert(schema.organizations)
      .values({
        workosOrganizationId: `org_${orgSuffix}`,
        name: "Partial Write-back Org",
        slug: `partial-writeback-${orgSuffix.slice(0, 8)}`,
      })
      .returning();
    const organizationId = organization!.id;

    await db.insert(schema.projects).values({
      id: projectId,
      identifier: uniqueTestProjectIdentifier(),
      organizationId,
      name: "External TMS Project",
      source: "external_tms",
      externalProviderKind: "crowdin",
      externalProjectId: "123",
    });

    const job = await createTestJob({ organizationId, projectId });

    const sourceRun = await createAgentRun({
      organizationId,
      providerKind: "crowdin",
      externalJobId: "task-2",
      kind: "translate",
      hyperlocaliseJobId: job.id,
      inputSnapshot: { projectId },
    });

    await startAgentRun({ runId: sourceRun.id, organizationId });

    pullExternalTmsTaskContentMock.mockResolvedValue({
      runId: "pull-run-2",
      status: "succeeded",
      providerKind: "crowdin",
      providerCredentialId: "cred-1",
      projectId,
      content: {
        externalJobId: "task-2",
        targetLocales: ["fr-FR", "de-DE"],
        units: [
          {
            externalStringId: "hash-1",
            key: "cta.label",
            sourceText: "Buy now",
            fileId: "101",
            translations: [],
          },
          {
            externalStringId: "hash-2",
            key: "cta.label",
            sourceText: "Buy now",
            fileId: "102",
            translations: [],
          },
        ],
      },
      counts: {
        unitsDiscovered: 2,
        translationsDiscovered: 0,
        approvedTranslations: 0,
      },
      failures: [],
    });

    await completeAgentRun({
      runId: sourceRun.id,
      organizationId,
      outputSummary: { proposals: 2 },
      changedItems: [
        serializeAgentRunProposalItem({
          itemId: "hash-1:fr-FR",
          externalStringId: "hash-1",
          key: "cta.label",
          locale: "fr-FR",
          sourceText: "Buy now",
          from: "",
          to: "Acheter",
          reviewState: "accepted",
          changedFields: ["target"],
          warnings: {},
        }),
        serializeAgentRunProposalItem({
          itemId: "hash-2:de-DE",
          externalStringId: "hash-2",
          key: "cta.label",
          locale: "de-DE",
          sourceText: "Buy now",
          from: "",
          to: "Kaufen",
          reviewState: "accepted",
          changedFields: ["target"],
          warnings: {},
        }),
      ],
    });

    const writebackRun = await createAgentRun({
      organizationId,
      providerKind: "crowdin",
      externalJobId: "task-2",
      kind: "translate",
      hyperlocaliseJobId: job.id,
      inputSnapshot: {
        action: "push_approved_changes",
        projectId,
        hyperlocaliseJobId: job.id,
      },
    });

    await startAgentRun({ runId: writebackRun.id, organizationId });

    pushExternalTmsTranslationsMock.mockResolvedValue({
      runId: "sync-run-2",
      status: "failed",
      providerKind: "crowdin",
      providerCredentialId: "cred-1",
      projectId,
      counts: {
        translationsRequested: 2,
        translationsUploaded: 1,
        translationsFailed: 1,
        asyncOperations: 0,
      },
      failures: [{ externalStringId: "hash-2", locale: "de-DE", message: "upload failed" }],
      asyncOperations: [],
    });

    const result = await executeProviderAgentWriteback({
      agentRunId: writebackRun.id,
      organizationId,
    });

    expect(result).toMatchObject({
      ok: true,
      uploaded: 1,
      failed: 1,
      pushRunId: "sync-run-2",
    });

    const [storedRun] = await db
      .select()
      .from(schema.agentRuns)
      .where(eq(schema.agentRuns.id, writebackRun.id))
      .limit(1);

    expect(storedRun?.status).toBe("succeeded");
    expect(storedRun?.changedItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          itemId: "hash-1:fr-FR",
          status: "uploaded",
        }),
        expect.objectContaining({
          itemId: "hash-2:de-DE",
          status: "failed",
          message: "upload failed",
        }),
      ]),
    );
  });

  it("forwards per-proposal fileIds so multi-file Crowdin keys do not collapse to task.fileIds[0]", async () => {
    const projectId = randomUUID();
    const orgSuffix = randomUUID();

    const [organization] = await db
      .insert(schema.organizations)
      .values({
        workosOrganizationId: `org_${orgSuffix}`,
        name: "Multi-file Write-back Org",
        slug: `multi-file-writeback-${orgSuffix.slice(0, 8)}`,
      })
      .returning();
    const organizationId = organization!.id;

    await db.insert(schema.projects).values({
      id: projectId,
      organizationId,
      name: "External TMS Project",
      source: "external_tms",
      externalProviderKind: "crowdin",
      externalProjectId: "123",
    });

    const job = await createTestJob({ organizationId, projectId });

    const sourceRun = await createAgentRun({
      organizationId,
      providerKind: "crowdin",
      externalJobId: "task-multi",
      kind: "translate",
      hyperlocaliseJobId: job.id,
      inputSnapshot: { projectId },
    });

    await startAgentRun({ runId: sourceRun.id, organizationId });

    await completeAgentRun({
      runId: sourceRun.id,
      organizationId,
      outputSummary: { proposals: 2 },
      changedItems: [
        serializeAgentRunProposalItem({
          itemId: "s1:fr-FR",
          externalStringId: "s1",
          key: "title",
          locale: "fr-FR",
          sourceText: "Title A",
          from: "",
          to: "Titre A",
          reviewState: "accepted",
          changedFields: ["target"],
          warnings: {},
          fileId: "11",
        }),
        serializeAgentRunProposalItem({
          itemId: "s2:fr-FR",
          externalStringId: "s2",
          key: "title",
          locale: "fr-FR",
          sourceText: "Title B",
          from: "",
          to: "Titre B",
          reviewState: "accepted",
          changedFields: ["target"],
          warnings: {},
          fileId: "22",
        }),
      ],
    });

    const writebackRun = await createAgentRun({
      organizationId,
      providerKind: "crowdin",
      externalJobId: "task-multi",
      kind: "translate",
      hyperlocaliseJobId: job.id,
      inputSnapshot: {
        action: "push_approved_changes",
        projectId,
        hyperlocaliseJobId: job.id,
      },
    });

    pushExternalTmsTranslationsMock.mockResolvedValue({
      runId: "sync-run-multi",
      status: "succeeded",
      providerKind: "crowdin",
      providerCredentialId: "cred-1",
      projectId,
      counts: {
        translationsRequested: 2,
        translationsUploaded: 2,
        translationsFailed: 0,
        asyncOperations: 0,
      },
      failures: [],
      asyncOperations: [],
    });

    const result = await executeProviderAgentWriteback({
      agentRunId: writebackRun.id,
      organizationId,
    });

    expect(result).toMatchObject({ ok: true, uploaded: 2, failed: 0 });
    expect(pushExternalTmsTranslationsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        translations: expect.arrayContaining([
          expect.objectContaining({
            externalStringId: "s1",
            key: "title",
            text: "Titre A",
            fileId: "11",
          }),
          expect.objectContaining({
            externalStringId: "s2",
            key: "title",
            text: "Titre B",
            fileId: "22",
          }),
        ]),
      }),
    );
  });

  it("resolves fileIds for legacy proposals missing fileId from task content", async () => {
    const projectId = randomUUID();
    const orgSuffix = randomUUID();

    const [organization] = await db
      .insert(schema.organizations)
      .values({
        workosOrganizationId: `org_${orgSuffix}`,
        name: "Legacy Write-back Org",
        slug: `legacy-writeback-${orgSuffix.slice(0, 8)}`,
      })
      .returning();
    const organizationId = organization!.id;

    await db.insert(schema.projects).values({
      id: projectId,
      organizationId,
      name: "External TMS Project",
      source: "external_tms",
      externalProviderKind: "crowdin",
      externalProjectId: "123",
    });

    const job = await createTestJob({ organizationId, projectId });

    const sourceRun = await createAgentRun({
      organizationId,
      providerKind: "crowdin",
      externalJobId: "task-legacy",
      kind: "translate",
      hyperlocaliseJobId: job.id,
      inputSnapshot: { projectId },
    });

    await startAgentRun({ runId: sourceRun.id, organizationId });

    await completeAgentRun({
      runId: sourceRun.id,
      organizationId,
      outputSummary: { proposals: 2 },
      changedItems: [
        {
          itemId: "s1:fr-FR",
          externalStringId: "s1",
          key: "title",
          locale: "fr-FR",
          sourceText: "Title A",
          from: "",
          to: "Titre A",
          reviewState: "accepted",
          changedFields: ["target"],
          warnings: {},
        },
        {
          itemId: "s2:fr-FR",
          externalStringId: "s2",
          key: "title",
          locale: "fr-FR",
          sourceText: "Title B",
          from: "",
          to: "Titre B",
          reviewState: "accepted",
          changedFields: ["target"],
          warnings: {},
        },
      ],
    });

    const writebackRun = await createAgentRun({
      organizationId,
      providerKind: "crowdin",
      externalJobId: "task-legacy",
      kind: "translate",
      hyperlocaliseJobId: job.id,
      inputSnapshot: {
        action: "push_approved_changes",
        projectId,
        hyperlocaliseJobId: job.id,
      },
    });

    pullExternalTmsTaskContentMock.mockResolvedValue({
      runId: "pull-run-legacy",
      status: "succeeded",
      providerKind: "crowdin",
      providerCredentialId: "cred-1",
      projectId,
      content: {
        externalJobId: "task-legacy",
        targetLocales: ["fr-FR"],
        units: [
          {
            externalStringId: "s1",
            key: "title",
            sourceText: "Title A",
            fileId: "11",
            translations: [],
          },
          {
            externalStringId: "s2",
            key: "title",
            sourceText: "Title B",
            fileId: "22",
            translations: [],
          },
        ],
      },
      counts: {
        unitsDiscovered: 2,
        translationsDiscovered: 0,
        approvedTranslations: 0,
      },
      failures: [],
    });

    pushExternalTmsTranslationsMock.mockResolvedValue({
      runId: "sync-run-legacy",
      status: "succeeded",
      providerKind: "crowdin",
      providerCredentialId: "cred-1",
      projectId,
      counts: {
        translationsRequested: 2,
        translationsUploaded: 2,
        translationsFailed: 0,
        asyncOperations: 0,
      },
      failures: [],
      asyncOperations: [],
    });

    const result = await executeProviderAgentWriteback({
      agentRunId: writebackRun.id,
      organizationId,
    });

    expect(result).toMatchObject({ ok: true, uploaded: 2, failed: 0 });
    expect(pullExternalTmsTaskContentMock).toHaveBeenCalledOnce();
    expect(pushExternalTmsTranslationsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        translations: expect.arrayContaining([
          expect.objectContaining({
            externalStringId: "s1",
            key: "title",
            text: "Titre A",
            fileId: "11",
          }),
          expect.objectContaining({
            externalStringId: "s2",
            key: "title",
            text: "Titre B",
            fileId: "22",
          }),
        ]),
      }),
    );
  });

  it("does not pull task content when every proposal already has fileId", async () => {
    const projectId = randomUUID();
    const orgSuffix = randomUUID();

    const [organization] = await db
      .insert(schema.organizations)
      .values({
        workosOrganizationId: `org_${orgSuffix}`,
        name: "No-pull Write-back Org",
        slug: `no-pull-writeback-${orgSuffix.slice(0, 8)}`,
      })
      .returning();
    const organizationId = organization!.id;

    await db.insert(schema.projects).values({
      id: projectId,
      organizationId,
      name: "External TMS Project",
      source: "external_tms",
      externalProviderKind: "crowdin",
      externalProjectId: "123",
    });

    const job = await createTestJob({ organizationId, projectId });

    const sourceRun = await createAgentRun({
      organizationId,
      providerKind: "crowdin",
      externalJobId: "task-no-pull",
      kind: "translate",
      hyperlocaliseJobId: job.id,
      inputSnapshot: { projectId },
    });

    await startAgentRun({ runId: sourceRun.id, organizationId });

    await completeAgentRun({
      runId: sourceRun.id,
      organizationId,
      outputSummary: { proposals: 1 },
      changedItems: [
        serializeAgentRunProposalItem({
          itemId: "hash-1:fr-FR",
          externalStringId: "hash-1",
          key: "cta.label",
          locale: "fr-FR",
          sourceText: "Buy now",
          from: "",
          to: "Acheter",
          reviewState: "accepted",
          changedFields: ["target"],
          warnings: {},
          fileId: "101",
        }),
      ],
    });

    const writebackRun = await createAgentRun({
      organizationId,
      providerKind: "crowdin",
      externalJobId: "task-no-pull",
      kind: "translate",
      hyperlocaliseJobId: job.id,
      inputSnapshot: {
        action: "push_approved_changes",
        projectId,
        hyperlocaliseJobId: job.id,
      },
    });

    pushExternalTmsTranslationsMock.mockResolvedValue({
      runId: "sync-run-no-pull",
      status: "succeeded",
      providerKind: "crowdin",
      providerCredentialId: "cred-1",
      projectId,
      counts: {
        translationsRequested: 1,
        translationsUploaded: 1,
        translationsFailed: 0,
        asyncOperations: 0,
      },
      failures: [],
      asyncOperations: [],
    });

    await executeProviderAgentWriteback({
      agentRunId: writebackRun.id,
      organizationId,
    });

    expect(pullExternalTmsTaskContentMock).not.toHaveBeenCalled();
  });

  it("pushes Phrase proposals without fileId instead of hard-failing legacy resolution", async () => {
    const projectId = randomUUID();
    const orgSuffix = randomUUID();

    const [organization] = await db
      .insert(schema.organizations)
      .values({
        workosOrganizationId: `org_${orgSuffix}`,
        name: "Phrase Write-back Org",
        slug: `phrase-writeback-${orgSuffix.slice(0, 8)}`,
      })
      .returning();
    const organizationId = organization!.id;

    await db.insert(schema.projects).values({
      id: projectId,
      organizationId,
      name: "Phrase Project",
      source: "external_tms",
      externalProviderKind: "phrase",
      externalProjectId: "phrase-proj-1",
    });

    const job = await createTestJob({ organizationId, projectId });

    const sourceRun = await createAgentRun({
      organizationId,
      providerKind: "phrase",
      externalJobId: "job-phrase-1",
      kind: "translate",
      hyperlocaliseJobId: job.id,
      inputSnapshot: { projectId },
    });

    await startAgentRun({ runId: sourceRun.id, organizationId });

    await completeAgentRun({
      runId: sourceRun.id,
      organizationId,
      outputSummary: { proposals: 1 },
      changedItems: [
        {
          itemId: "key-1:de-DE",
          externalStringId: "key-1",
          key: "cta.label",
          locale: "de-DE",
          sourceText: "Buy now",
          from: "",
          to: "Jetzt kaufen",
          reviewState: "accepted",
          changedFields: ["target"],
          warnings: {},
        },
      ],
    });

    const writebackRun = await createAgentRun({
      organizationId,
      providerKind: "phrase",
      externalJobId: "job-phrase-1",
      kind: "translate",
      hyperlocaliseJobId: job.id,
      inputSnapshot: {
        action: "push_approved_changes",
        projectId,
        hyperlocaliseJobId: job.id,
      },
    });

    pushExternalTmsTranslationsMock.mockResolvedValue({
      runId: "sync-run-phrase",
      status: "succeeded",
      providerKind: "phrase",
      providerCredentialId: "cred-phrase",
      projectId,
      counts: {
        translationsRequested: 1,
        translationsUploaded: 1,
        translationsFailed: 0,
        asyncOperations: 0,
      },
      failures: [],
      asyncOperations: [],
    });

    const result = await executeProviderAgentWriteback({
      agentRunId: writebackRun.id,
      organizationId,
    });

    expect(result).toMatchObject({ ok: true, uploaded: 1, failed: 0 });
    expect(pullExternalTmsTaskContentMock).not.toHaveBeenCalled();
    expect(pushExternalTmsTranslationsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        providerKind: "phrase",
        translations: [
          expect.objectContaining({
            externalStringId: "key-1",
            key: "cta.label",
            locale: "de-DE",
            text: "Jetzt kaufen",
          }),
        ],
      }),
    );
    expect(
      pushExternalTmsTranslationsMock.mock.calls[0]?.[0]?.translations?.[0]?.fileId,
    ).toBeUndefined();
  });
});
