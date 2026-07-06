import { and, eq } from "drizzle-orm";

import { db, schema } from "@/lib/database";

import {
  completeAgentRun,
  failAgentRun,
  getAgentRun,
  listAgentRuns,
  startAgentRun,
} from "../agent-runs/agent-runs";
import { getProviderCommentPusher } from "@/lib/providers/adapters/tms-provider-registry";
import type {
  ProviderCommentChangedItem,
  ProviderQaFeedbackUpload,
} from "@/lib/providers/shared/provider-feedback-types";
import { buildFindingId } from "../provider-job-qa/build-finding-id";
import type { ProviderQaFinding } from "../provider-job-qa/types";
import { crowdinAuth } from "@/lib/providers/adapters/crowdin/crowdin-auth";
import {
  getPhraseUserConnection,
  resolvePhraseUserConnectionSecretMaterial,
} from "@/lib/providers/adapters/phrase/phrase-auth";
import { lokaliseAuth } from "@/lib/providers/adapters/lokalise/lokalise-auth";
import {
  crowdinUsesPerUserAuth,
  OAUTH_AUTH_MODE,
  resolveExternalTmsSecretMaterial,
  type ExternalTmsProviderKind,
} from "@/lib/providers/credentials/organization-external-tms-provider-credentials";

export type ProviderAgentCommentResult =
  | {
      ok: true;
      agentRunId: string;
      posted: number;
      skipped: number;
      failed: number;
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

function readSelectedFindings(inputSnapshot: Record<string, unknown>): ProviderQaFinding[] {
  const selectedFindings = inputSnapshot.selectedFindings;
  if (!Array.isArray(selectedFindings)) {
    return [];
  }

  return selectedFindings.filter((finding): finding is ProviderQaFinding => {
    if (!finding || typeof finding !== "object") {
      return false;
    }

    const candidate = finding as ProviderQaFinding;
    return (
      typeof candidate.checkType === "string" &&
      typeof candidate.severity === "string" &&
      typeof candidate.message === "string" &&
      typeof candidate.item?.externalStringId === "string" &&
      typeof candidate.item?.key === "string"
    );
  });
}

function readOutputSummaryNumber(outputSummary: Record<string, unknown>, key: string): number {
  const value = outputSummary[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function isProviderCommentChangedItem(
  item: Record<string, unknown>,
): item is ProviderCommentChangedItem {
  return item.type === "provider_comment" && typeof item.findingId === "string";
}

function indexKnownExternalIdsFromChangedItems(
  changedItems: Record<string, unknown>[],
): Map<string, { issueUid: string; commentUid?: string | null }> {
  const map = new Map<string, { issueUid: string; commentUid?: string | null }>();

  for (const item of changedItems) {
    if (!isProviderCommentChangedItem(item)) {
      continue;
    }

    if (!item.externalIssueUid) {
      continue;
    }

    map.set(item.findingId, {
      issueUid: item.externalIssueUid,
      commentUid: item.externalCommentUid ?? null,
    });
  }

  return map;
}

async function loadKnownProviderCommentExternalIds(input: {
  organizationId: string;
  hyperlocaliseJobId: string | null;
  currentRunId: string;
  currentChangedItems: Record<string, unknown>[];
}) {
  const known = indexKnownExternalIdsFromChangedItems(input.currentChangedItems);

  if (!input.hyperlocaliseJobId) {
    return known;
  }

  const priorRuns = await listAgentRuns({
    organizationId: input.organizationId,
    hyperlocaliseJobId: input.hyperlocaliseJobId,
    kind: "comment_only",
    status: "succeeded",
    limit: 100,
  });

  for (const run of priorRuns) {
    if (run.id === input.currentRunId) {
      continue;
    }

    const items = Array.isArray(run.changedItems)
      ? (run.changedItems as Record<string, unknown>[])
      : [];

    for (const [findingId, external] of indexKnownExternalIdsFromChangedItems(items)) {
      if (!known.has(findingId)) {
        known.set(findingId, external);
      }
    }
  }

  return known;
}

async function getExternalTmsProject(input: {
  organizationId: string;
  projectId: string;
  providerKind: ExternalTmsProviderKind;
}) {
  const [project] = await db
    .select()
    .from(schema.projects)
    .where(
      and(
        eq(schema.projects.id, input.projectId),
        eq(schema.projects.organizationId, input.organizationId),
        eq(schema.projects.externalProviderKind, input.providerKind),
        eq(schema.projects.source, "external_tms"),
      ),
    )
    .limit(1);

  return project ?? null;
}

async function getExternalTmsCredential(input: {
  organizationId: string;
  providerKind: ExternalTmsProviderKind;
  credentialId: string | null;
}) {
  if (!input.credentialId) {
    return null;
  }

  const [credential] = await db
    .select()
    .from(schema.organizationExternalTmsProviderCredentials)
    .where(
      and(
        eq(schema.organizationExternalTmsProviderCredentials.organizationId, input.organizationId),
        eq(schema.organizationExternalTmsProviderCredentials.providerKind, input.providerKind),
        eq(schema.organizationExternalTmsProviderCredentials.id, input.credentialId),
      ),
    )
    .limit(1);

  return credential ?? null;
}

export async function executeProviderAgentComment(input: {
  agentRunId: string;
  organizationId: string;
}): Promise<ProviderAgentCommentResult> {
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

  if (run.kind !== "comment_only") {
    return {
      ok: false,
      agentRunId: input.agentRunId,
      code: "unsupported_agent_run_kind",
      message: `Agent run kind ${run.kind} is not supported for provider comments`,
    };
  }

  if (run.status === "succeeded") {
    const outputSummary = run.outputSummary ?? {};
    return {
      ok: true,
      agentRunId: input.agentRunId,
      posted: readOutputSummaryNumber(outputSummary, "posted"),
      skipped: readOutputSummaryNumber(outputSummary, "skipped"),
      failed: readOutputSummaryNumber(outputSummary, "failed"),
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

  const selectedFindings = readSelectedFindings(run.inputSnapshot);
  if (selectedFindings.length === 0) {
    await failAgentRun({
      runId: run.id,
      organizationId: input.organizationId,
      outputSummary: { code: "missing_selected_findings" },
      warnings: ["No QA findings were selected for provider comment write-back"],
    });

    return {
      ok: false,
      agentRunId: input.agentRunId,
      code: "missing_selected_findings",
      message: "No QA findings were selected for provider comment write-back",
    };
  }

  const pushComments = getProviderCommentPusher(run.providerKind);
  if (!pushComments) {
    await failAgentRun({
      runId: run.id,
      organizationId: input.organizationId,
      outputSummary: {
        code: "unsupported_provider_comment_push",
        providerKind: run.providerKind,
      },
      warnings: [`Provider ${run.providerKind} does not support comment write-back yet`],
    });

    return {
      ok: false,
      agentRunId: input.agentRunId,
      code: "unsupported_provider_comment_push",
      message: `Provider ${run.providerKind} does not support comment write-back yet`,
    };
  }

  const project = await getExternalTmsProject({
    organizationId: input.organizationId,
    projectId,
    providerKind: run.providerKind,
  });

  if (!project?.externalProjectId) {
    await failAgentRun({
      runId: run.id,
      organizationId: input.organizationId,
      outputSummary: { code: "external_tms_project_not_found" },
      warnings: ["External TMS project was not found for provider comment write-back"],
    });

    return {
      ok: false,
      agentRunId: input.agentRunId,
      code: "external_tms_project_not_found",
      message: "External TMS project was not found for provider comment write-back",
    };
  }

  const credential = await getExternalTmsCredential({
    organizationId: input.organizationId,
    providerKind: run.providerKind,
    credentialId: project.externalProviderCredentialId,
  });

  if (!credential) {
    await failAgentRun({
      runId: run.id,
      organizationId: input.organizationId,
      outputSummary: { code: "provider_credential_not_found" },
      warnings: ["Provider credential was not found for comment write-back"],
    });

    return {
      ok: false,
      agentRunId: input.agentRunId,
      code: "provider_credential_not_found",
      message: "Provider credential was not found for comment write-back",
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

  const currentChangedItems = Array.isArray(run.changedItems)
    ? (run.changedItems as Record<string, unknown>[])
    : [];

  const knownExternalIds = await loadKnownProviderCommentExternalIds({
    organizationId: input.organizationId,
    hyperlocaliseJobId: run.hyperlocaliseJobId,
    currentRunId: run.id,
    currentChangedItems,
  });

  const feedback: ProviderQaFeedbackUpload[] = selectedFindings.map((finding) => ({
    findingId: buildFindingId(finding),
    finding,
  }));

  try {
    const secretMaterial = await resolveProviderCommentSecretMaterial({
      credential,
      organizationId: input.organizationId,
      actorUserId: run.actorUserId,
    });

    const pushResult = await pushComments({
      organizationId: input.organizationId,
      projectId: project.id,
      providerKind: run.providerKind,
      externalProjectId: project.externalProjectId,
      externalJobId: run.externalJobId,
      credential,
      secretMaterial,
      feedback,
      knownExternalIds,
    });

    const warnings = pushResult.failures.map(
      (failure) => `${failure.findingId}: ${failure.message}`,
    );

    await completeAgentRun({
      runId: run.id,
      organizationId: input.organizationId,
      outputSummary: {
        posted: pushResult.posted,
        skipped: pushResult.skipped,
        failed: pushResult.failed,
        findingsRequested: feedback.length,
      },
      changedItems: pushResult.changedItems,
      warnings,
    });

    return {
      ok: true,
      agentRunId: input.agentRunId,
      posted: pushResult.posted,
      skipped: pushResult.skipped,
      failed: pushResult.failed,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Provider comment write-back failed";
    await failAgentRun({
      runId: run.id,
      organizationId: input.organizationId,
      outputSummary: { code: "provider_comment_push_failed" },
      warnings: [message],
    });

    return {
      ok: false,
      agentRunId: input.agentRunId,
      code: "provider_comment_push_failed",
      message,
    };
  }
}

async function resolveProviderCommentSecretMaterial(input: {
  credential: typeof schema.organizationExternalTmsProviderCredentials.$inferSelect;
  organizationId: string;
  actorUserId?: string | null;
}) {
  if (
    !(
      input.credential.providerKind === "crowdin" &&
      crowdinUsesPerUserAuth(input.credential.authMode)
    ) &&
    !(
      input.credential.providerKind === "phrase" && input.credential.authMode === OAUTH_AUTH_MODE
    ) &&
    !(input.credential.providerKind === "lokalise" && input.credential.authMode === OAUTH_AUTH_MODE)
  ) {
    return resolveExternalTmsSecretMaterial({ credential: input.credential });
  }

  if (!input.actorUserId) {
    throw new Error(`${input.credential.providerKind}_user_connection_required`);
  }

  if (input.credential.providerKind === "phrase") {
    const connection = await getPhraseUserConnection({
      organizationId: input.organizationId,
      userId: input.actorUserId,
    });
    if (!connection) {
      throw new Error("phrase_user_connection_required");
    }

    return resolvePhraseUserConnectionSecretMaterial({
      connection,
      baseUrl: input.credential.baseUrl,
    });
  }

  if (input.credential.providerKind === "lokalise") {
    const connection = await lokaliseAuth.getUserConnection({
      organizationId: input.organizationId,
      userId: input.actorUserId,
    });
    if (!connection) {
      throw new Error("lokalise_user_connection_required");
    }

    return lokaliseAuth.resolveUserConnectionSecretMaterial({ connection });
  }

  const connection = await crowdinAuth.getUserConnection({
    organizationId: input.organizationId,
    userId: input.actorUserId,
  });
  if (!connection) {
    throw new Error("crowdin_user_connection_required");
  }

  return crowdinAuth.resolveUserConnectionSecretMaterial({
    connection,
    authMode: input.credential.authMode ?? OAUTH_AUTH_MODE,
  });
}
