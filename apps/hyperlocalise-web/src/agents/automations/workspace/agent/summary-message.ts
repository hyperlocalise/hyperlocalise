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
import type { WorkspaceOrchestratorSession } from "./context";

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (entry): entry is string => typeof entry === "string" && entry.trim().length > 0,
  );
}

/**
 * `notify_slack` / `notify_email` run inside the tool loop, before
 * `deriveTerminalStatus` persists the final run status. Prefer explicit
 * terminal signals; treat still-queued/running as completed for the summary.
 */
export function resolveNotificationOutcome(
  session: Pick<WorkspaceOrchestratorSession, "terminalStatus" | "terminalError" | "run">,
): "completed" | "failed" | "skipped" | "cancelled" {
  if (session.terminalError || session.run.error) {
    return "failed";
  }

  const status = session.terminalStatus ?? session.run.status;
  if (status === "failed") {
    return "failed";
  }
  if (status === "skipped") {
    return "skipped";
  }
  if (status === "cancelled") {
    return "cancelled";
  }

  return "completed";
}

function formatStatusLabel(outcome: ReturnType<typeof resolveNotificationOutcome>): string {
  const labels: Record<ReturnType<typeof resolveNotificationOutcome>, string> = {
    completed: "SUCCEEDED",
    failed: "FAILED",
    skipped: "SKIPPED",
    cancelled: "CANCELLED",
  };
  return labels[outcome];
}

function buildNativeTmsSummary(session: WorkspaceOrchestratorSession): string | null {
  const createdJob = session.stepResults.create_native_tms_job;
  if (!createdJob) {
    return null;
  }

  const outcome = resolveNotificationOutcome(session);
  const lines = [`**${session.automation.name}** ${outcome}`, ""];

  const jobId = asString(createdJob.jobId);
  if (jobId) {
    lines.push(`- **Job:** \`${jobId}\``);
  }

  const sourceFileId = asString(createdJob.sourceFileId);
  if (sourceFileId) {
    lines.push(`- **Source file:** \`${sourceFileId}\``);
  }

  const sourceFileVersionId = asString(createdJob.sourceFileVersionId);
  if (sourceFileVersionId) {
    lines.push(`- **Version:** \`${sourceFileVersionId}\``);
  }

  const locales = asStringArray(createdJob.targetLocales);
  if (locales.length === 1) {
    lines.push(`- **Locale:** ${locales[0]}`);
  } else if (locales.length > 1) {
    lines.push("- **Locales:**");
    for (const locale of locales) {
      lines.push(`  - ${locale}`);
    }
  }

  const assignResult = session.stepResults.assign_translate_with_agent;
  if (assignResult && assignResult.enqueued === true) {
    lines.push("- **Next:** Assigned to Translate with agent; localisation enqueued");
  }

  if (session.terminalError) {
    lines.push(`- **Error:** ${session.terminalError}`);
  }

  return lines.join("\n");
}

export function buildOrchestratorRunSummaryMessage(session: WorkspaceOrchestratorSession) {
  const githubAgentResult = session.stepResults.use_github_repository;
  const githubDigest =
    githubAgentResult && typeof githubAgentResult.digest === "string"
      ? githubAgentResult.digest.trim()
      : null;
  const crowdinSummary = asString(session.stepResults.use_crowdin?.summary);

  if (githubDigest) {
    if (crowdinSummary) {
      return `${githubDigest}\n\n## Crowdin review\n\n${crowdinSummary}`;
    }
    return githubDigest;
  }

  if (crowdinSummary) {
    return crowdinSummary;
  }

  const nativeTmsSummary = buildNativeTmsSummary(session);
  if (nativeTmsSummary) {
    return nativeTmsSummary;
  }

  const outcome = resolveNotificationOutcome(session);
  const statusLabel = formatStatusLabel(outcome);
  const lines = [
    `**${session.automation.name}** finished`,
    "",
    `- **Status:** ${statusLabel}`,
    `- **Trigger:** ${session.run.triggerSource}`,
  ];

  const githubResult = session.stepResults.run_github_workflows;
  if (githubResult) {
    lines.push(`- **GitHub:** \`${JSON.stringify(githubResult)}\``);
  }

  const contentfulResult = session.stepResults.run_contentful_translation;
  if (contentfulResult) {
    lines.push(`- **Contentful:** \`${JSON.stringify(contentfulResult)}\``);
  }

  if (session.terminalError) {
    lines.push(`- **Error:** ${session.terminalError}`);
  } else if (session.run.error) {
    lines.push(`- **Error:** \`${JSON.stringify(session.run.error)}\``);
  }

  return lines.join("\n");
}
