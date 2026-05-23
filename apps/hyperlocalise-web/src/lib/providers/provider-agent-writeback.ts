import {
  collectAcceptedAgentRunProposalsForJob,
  isPushApprovedWritebackAgentRun,
  type AcceptedAgentRunProposal,
} from "./agent-run-proposals";
import {
  completeAgentRun,
  failAgentRun,
  getAgentRun,
  listAgentRuns,
  startAgentRun,
} from "./agent-runs";
import {
  pushExternalTmsTranslations,
  type ExternalTmsApprovedTranslationUpload,
} from "./external-tms-content-sync";
import type { ProviderTranslationWritebackChangedItem } from "./provider-feedback-types";
import { getProviderTranslationPusher } from "./provider-translation-pushers";

export type ProviderAgentWritebackResult =
  | {
      ok: true;
      agentRunId: string;
      uploaded: number;
      skipped: number;
      failed: number;
      pushRunId?: string;
      alreadyCompleted?: boolean;
    }
  | {
      ok: false;
      agentRunId: string;
      code: string;
      message: string;
    };

function readProjectIdFromInputSnapshot(inputSnapshot: Record<string, unknown>): string | null {
  const projectId = inputSnapshot.projectId;
  return typeof projectId === "string" && projectId.length > 0 ? projectId : null;
}

function readOutputSummaryNumber(outputSummary: Record<string, unknown>, key: string): number {
  const value = outputSummary[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function readOutputSummaryString(
  outputSummary: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = outputSummary[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function isProviderTranslationWritebackChangedItem(
  item: Record<string, unknown>,
): item is ProviderTranslationWritebackChangedItem {
  return item.type === "provider_translation_writeback" && typeof item.itemId === "string";
}

function loadPreviouslyUploadedItemIds(input: {
  runs: Array<{
    id: string;
    inputSnapshot: Record<string, unknown>;
    changedItems: Record<string, unknown>[];
  }>;
  currentRunId: string;
}) {
  const uploaded = new Set<string>();

  for (const run of input.runs) {
    if (run.id === input.currentRunId) {
      continue;
    }

    if (!isPushApprovedWritebackAgentRun(run.inputSnapshot)) {
      continue;
    }

    const changedItems = Array.isArray(run.changedItems)
      ? (run.changedItems as Record<string, unknown>[])
      : [];

    for (const item of changedItems) {
      if (!isProviderTranslationWritebackChangedItem(item)) {
        continue;
      }

      if (item.status === "uploaded" || item.status === "skipped") {
        uploaded.add(item.itemId);
      }
    }
  }

  return uploaded;
}

function buildWritebackChangedItems(input: {
  proposals: AcceptedAgentRunProposal[];
  skippedItemIds: Set<string>;
  uploaded: number;
  failed: number;
  failures: Array<{ locale: string | null; message: string }>;
}): ProviderTranslationWritebackChangedItem[] {
  const changedItems: ProviderTranslationWritebackChangedItem[] = [];
  const failedLocales = new Set(
    input.failures.map((failure) => failure.locale).filter((locale): locale is string => !!locale),
  );
  const failureMessage =
    input.failures[0]?.message ?? "One or more provider translation uploads failed";

  for (const proposal of input.proposals) {
    if (input.skippedItemIds.has(proposal.itemId)) {
      changedItems.push({
        type: "provider_translation_writeback",
        itemId: proposal.itemId,
        externalStringId: proposal.externalStringId,
        key: proposal.key,
        locale: proposal.locale,
        status: "skipped",
        sourceAgentRunId: proposal.sourceAgentRunId,
        message: "already_uploaded",
      });
      continue;
    }

    let status: ProviderTranslationWritebackChangedItem["status"] = "uploaded";
    let message: string | null = null;

    if (input.failed > 0 && input.uploaded === 0) {
      status = "failed";
      message = failureMessage;
    } else if (input.failed > 0 && failedLocales.has(proposal.locale)) {
      status = "failed";
      message =
        input.failures.find((failure) => failure.locale === proposal.locale)?.message ??
        failureMessage;
    }

    changedItems.push({
      type: "provider_translation_writeback",
      itemId: proposal.itemId,
      externalStringId: proposal.externalStringId,
      key: proposal.key,
      locale: proposal.locale,
      status,
      sourceAgentRunId: proposal.sourceAgentRunId,
      message,
    });
  }

  return changedItems;
}

export async function executeProviderAgentWriteback(input: {
  agentRunId: string;
  organizationId: string;
}): Promise<ProviderAgentWritebackResult> {
  const run = await getAgentRun({
    runId: input.agentRunId,
    organizationId: input.organizationId,
  });

  if (!run) {
    return {
      ok: false,
      agentRunId: input.agentRunId,
      code: "agent_run_not_found",
      message: "Agent run not found",
    };
  }

  if (!isPushApprovedWritebackAgentRun(run.inputSnapshot)) {
    return {
      ok: false,
      agentRunId: input.agentRunId,
      code: "unsupported_agent_run_action",
      message: "Agent run is not a push approved changes write-back action",
    };
  }

  if (run.status === "succeeded") {
    const outputSummary = run.outputSummary ?? {};
    return {
      ok: true,
      agentRunId: input.agentRunId,
      uploaded: readOutputSummaryNumber(outputSummary, "uploaded"),
      skipped: readOutputSummaryNumber(outputSummary, "skipped"),
      failed: readOutputSummaryNumber(outputSummary, "failed"),
      pushRunId: readOutputSummaryString(outputSummary, "pushRunId"),
      alreadyCompleted: true,
    };
  }

  if (run.status === "failed" || run.status === "cancelled") {
    return {
      ok: false,
      agentRunId: input.agentRunId,
      code: run.status === "failed" ? "agent_run_already_failed" : "agent_run_already_cancelled",
      message: `Agent run is ${run.status}, expected queued or running`,
    };
  }

  const projectId = readProjectIdFromInputSnapshot(run.inputSnapshot);
  if (!projectId) {
    await failAgentRun({
      runId: run.id,
      organizationId: input.organizationId,
      outputSummary: { code: "missing_project_id" },
      warnings: ["Agent run input snapshot is missing projectId"],
    });

    return {
      ok: false,
      agentRunId: input.agentRunId,
      code: "missing_project_id",
      message: "Agent run input snapshot is missing projectId",
    };
  }

  if (!run.hyperlocaliseJobId) {
    await failAgentRun({
      runId: run.id,
      organizationId: input.organizationId,
      outputSummary: { code: "missing_hyperlocalise_job_id" },
      warnings: ["Agent run is missing hyperlocaliseJobId"],
    });

    return {
      ok: false,
      agentRunId: input.agentRunId,
      code: "missing_hyperlocalise_job_id",
      message: "Agent run is missing hyperlocaliseJobId",
    };
  }

  const pushTranslations = getProviderTranslationPusher(run.providerKind);
  if (!pushTranslations) {
    await failAgentRun({
      runId: run.id,
      organizationId: input.organizationId,
      outputSummary: {
        code: "unsupported_provider_translation_push",
        providerKind: run.providerKind,
      },
      warnings: [`Provider ${run.providerKind} does not support translation write-back yet`],
    });

    return {
      ok: false,
      agentRunId: input.agentRunId,
      code: "unsupported_provider_translation_push",
      message: `Provider ${run.providerKind} does not support translation write-back yet`,
    };
  }

  if (run.status === "queued") {
    try {
      await startAgentRun({
        runId: run.id,
        organizationId: input.organizationId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to start agent run";
      await failAgentRun({
        runId: run.id,
        organizationId: input.organizationId,
        outputSummary: { code: "agent_run_start_failed" },
        warnings: [message],
      });
      return {
        ok: false,
        agentRunId: input.agentRunId,
        code: "agent_run_start_failed",
        message,
      };
    }
  }

  const jobRuns = await listAgentRuns({
    organizationId: input.organizationId,
    hyperlocaliseJobId: run.hyperlocaliseJobId,
    limit: 200,
  });

  const acceptedProposals = collectAcceptedAgentRunProposalsForJob({ runs: jobRuns });
  const previouslyUploadedItemIds = loadPreviouslyUploadedItemIds({
    runs: jobRuns,
    currentRunId: run.id,
  });

  const proposalsToPush = acceptedProposals.filter(
    (proposal) => !previouslyUploadedItemIds.has(proposal.itemId),
  );
  const skippedCount = acceptedProposals.length - proposalsToPush.length;

  if (acceptedProposals.length === 0) {
    await failAgentRun({
      runId: run.id,
      organizationId: input.organizationId,
      outputSummary: { code: "no_accepted_proposals" },
      warnings: ["No accepted agent proposals were found for translation write-back"],
    });

    return {
      ok: false,
      agentRunId: input.agentRunId,
      code: "no_accepted_proposals",
      message: "No accepted agent proposals were found for translation write-back",
    };
  }

  if (proposalsToPush.length === 0) {
    const changedItems = buildWritebackChangedItems({
      proposals: acceptedProposals,
      skippedItemIds: previouslyUploadedItemIds,
      uploaded: 0,
      failed: 0,
      failures: [],
    });

    await completeAgentRun({
      runId: run.id,
      organizationId: input.organizationId,
      outputSummary: {
        uploaded: 0,
        skipped: skippedCount,
        failed: 0,
        translationsRequested: 0,
        acceptedProposals: acceptedProposals.length,
      },
      changedItems,
      warnings: [],
    });

    return {
      ok: true,
      agentRunId: input.agentRunId,
      uploaded: 0,
      skipped: skippedCount,
      failed: 0,
    };
  }

  const translations: ExternalTmsApprovedTranslationUpload[] = proposalsToPush.map((proposal) => ({
    externalStringId: proposal.externalStringId,
    key: proposal.key,
    locale: proposal.locale,
    text: proposal.to,
  }));

  try {
    const pushResult = await pushExternalTmsTranslations({
      organizationId: input.organizationId,
      projectId,
      providerKind: run.providerKind,
      externalJobId: run.externalJobId,
      translations,
      pushTranslations,
    });

    const changedItems = buildWritebackChangedItems({
      proposals: acceptedProposals,
      skippedItemIds: previouslyUploadedItemIds,
      uploaded: pushResult.counts.translationsUploaded,
      failed: pushResult.counts.translationsFailed,
      failures: pushResult.failures,
    });

    const uploaded = changedItems.filter((item) => item.status === "uploaded").length;
    const failed = changedItems.filter((item) => item.status === "failed").length;
    const warnings = pushResult.failures.map(
      (failure) => `${failure.locale ?? "unknown"}: ${failure.message}`,
    );

    const outputSummary = {
      pushRunId: pushResult.runId,
      uploaded,
      skipped: skippedCount,
      failed,
      translationsRequested: translations.length,
      acceptedProposals: acceptedProposals.length,
      providerSyncStatus: pushResult.status,
    };

    if (uploaded === 0 && failed > 0) {
      await failAgentRun({
        runId: run.id,
        organizationId: input.organizationId,
        outputSummary: { ...outputSummary, code: "provider_translation_push_failed" },
        warnings,
      });

      return {
        ok: false,
        agentRunId: input.agentRunId,
        code: "provider_translation_push_failed",
        message: warnings[0] ?? "Provider translation write-back failed",
      };
    }

    await completeAgentRun({
      runId: run.id,
      organizationId: input.organizationId,
      outputSummary,
      changedItems,
      warnings,
    });

    return {
      ok: true,
      agentRunId: input.agentRunId,
      uploaded,
      skipped: skippedCount,
      failed,
      pushRunId: pushResult.runId,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Provider translation write-back failed";

    const changedItems = buildWritebackChangedItems({
      proposals: acceptedProposals,
      skippedItemIds: previouslyUploadedItemIds,
      uploaded: 0,
      failed: proposalsToPush.length,
      failures: [{ locale: null, message }],
    });

    await failAgentRun({
      runId: run.id,
      organizationId: input.organizationId,
      outputSummary: {
        code: "provider_translation_push_failed",
        uploaded: 0,
        skipped: skippedCount,
        failed: proposalsToPush.length,
        translationsRequested: translations.length,
      },
      changedItems,
      warnings: [message],
    });

    return {
      ok: false,
      agentRunId: input.agentRunId,
      code: "provider_translation_push_failed",
      message,
    };
  }
}
