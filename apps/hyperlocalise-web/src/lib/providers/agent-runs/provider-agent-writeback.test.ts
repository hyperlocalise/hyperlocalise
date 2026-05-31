import "dotenv/config";

import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { db, schema } from "@/lib/database";

import { completeAgentRun, createAgentRun, startAgentRun } from "../agent-runs/agent-runs";
import { serializeAgentRunProposalItem } from "./agent-run-proposals";
import { executeProviderAgentWriteback } from "./provider-agent-writeback";

const pushExternalTmsTranslationsMock = vi.hoisted(() => vi.fn());

vi.mock("../sync/external-tms-content-sync", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../sync/external-tms-content-sync")>();
  return {
    ...actual,
    pushExternalTmsTranslations: (...args: unknown[]) => pushExternalTmsTranslationsMock(...args),
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
  afterEach(() => {
    pushExternalTmsTranslationsMock.mockReset();
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
});
