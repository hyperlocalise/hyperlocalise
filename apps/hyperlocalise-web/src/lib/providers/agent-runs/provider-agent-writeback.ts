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
} from "../agent-runs/agent-runs";
import {
  pushExternalTmsTranslations,
  type ExternalTmsApprovedTranslationUpload,
  type ExternalTmsContentSyncFailure,
} from "../sync/external-tms-content-sync";
import type { ProviderTranslationWritebackChangedItem } from "../provider-feedback-types";
import { getProviderTranslationPusher } from "../provider-translation-pushers";

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

const JOB_AGENT_RUNS_PAGE_SIZE = 200;

async function listAllAgentRunsForJob(input: {
  organizationId: string;
  hyperlocaliseJobId: string;
}) {
  const runs: Awaited<ReturnType<typeof listAgentRuns>> = [];
  let offset = 0;

  while (true) {
    const page = await listAgentRuns({
      organizationId: input.organizationId,
      hyperlocaliseJobId: input.hyperlocaliseJobId,
      limit: JOB_AGENT_RUNS_PAGE_SIZE,
      offset,
    });

    runs.push(...page);

    if (page.length < JOB_AGENT_RUNS_PAGE_SIZE) {
      break;
    }

    offset += JOB_AGENT_RUNS_PAGE_SIZE;
  }

  return runs;
}

function resolveWritebackItemStatus(input: {
  proposal: AcceptedAgentRunProposal;
  uploaded: number;
  failed: number;
  failures: ExternalTmsContentSyncFailure[];
  failureByExternalStringId: Map<string, ExternalTmsContentSyncFailure>;
  localeOnlyFailedLocales: Set<string>;
  defaultFailureMessage: string;
}): Pick<ProviderTranslationWritebackChangedItem, "status" | "message"> {
  if (input.failed > 0 && input.uploaded === 0) {
    return { status: "failed", message: input.defaultFailureMessage };
  }

  const stringFailure = input.failureByExternalStringId.get(input.proposal.externalStringId);
  if (stringFailure) {
    return { status: "failed", message: stringFailure.message };
  }

  if (input.failed > 0 && input.localeOnlyFailedLocales.has(input.proposal.locale)) {
    const localeFailure = input.failures.find(
      (failure) => !failure.externalStringId && failure.locale === input.proposal.locale,
    );
    return {
      status: "failed",
      message: localeFailure?.message ?? input.defaultFailureMessage,
    };
  }

  return { status: "uploaded", message: null };
}

function buildWritebackChangedItems(input: {
  proposals: AcceptedAgentRunProposal[];
  skippedItemIds: Set<string>;
  uploaded: number;
  failed: number;
  failures: ExternalTmsContentSyncFailure[];
}): ProviderTranslationWritebackChangedItem[] {
  const changedItems: ProviderTranslationWritebackChangedItem[] = [];
  const failureByExternalStringId = new Map<string, ExternalTmsContentSyncFailure>();
  const localeOnlyFailedLocales = new Set<string>();

  for (const failure of input.failures) {
    if (failure.externalStringId) {
      failureByExternalStringId.set(failure.externalStringId, failure);
      continue;
    }

    if (failure.locale) {
      localeOnlyFailedLocales.add(failure.locale);
    }
  }

  const defaultFailureMessage =
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

    const { status, message } = resolveWritebackItemStatus({
      proposal,
      uploaded: input.uploaded,
      failed: input.failed,
      failures: input.failures,
      failureByExternalStringId,
      localeOnlyFailedLocales,
      defaultFailureMessage,
    });

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

  const jobRuns = await listAllAgentRunsForJob({
    organizationId: input.organizationId,
    hyperlocaliseJobId: run.hyperlocaliseJobId,
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
        changedItems,
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
      failures: [{ externalStringId: null, locale: null, message }],
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
