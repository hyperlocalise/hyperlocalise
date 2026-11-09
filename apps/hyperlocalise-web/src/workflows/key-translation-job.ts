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
import { getWorkflowMetadata } from "workflow";

import type { JobEventInput } from "@/lib/job-events/job-events-contract";
import type { KeyTranslationJobPlan } from "@/lib/translation/key-translation-job";
import {
  KEY_TRANSLATION_BATCH_SIZE,
  mergeKeyTranslationBatchResults,
  type KeyTranslationBatchResult,
  type KeyTranslationJobOutcome,
  type KeyTranslationTokenUsage,
} from "@/lib/translation/key-translation-job-results";
import type { TranslationJobEventData } from "@/lib/workflow/types";

import {
  claimTranslationJobStep,
  ensureAiFeaturesAllowedStep,
  failTranslationJobStep,
  recordJobEventsStep,
} from "./steps/translation-job";

async function planKeyTranslationJobStep(input: { jobId: string; projectId: string }) {
  "use step";
  const { planKeyTranslationJob } = await import("@/lib/translation/key-translation-job");
  return planKeyTranslationJob(input);
}

async function translateKeyBatchStep(input: {
  jobId: string;
  workflowRunId: string;
  plannedAt: string;
  projectId: string;
  organizationId: string;
  sourceLocale: string;
  overwriteUnapproved: boolean;
  knowledgeMemoryEnabled: boolean;
  recordProvenance: boolean;
  items: KeyTranslationJobPlan["items"];
}): Promise<KeyTranslationBatchResult> {
  "use step";
  const { translateKeyBatch } = await import("@/lib/translation/key-translation-job");
  return translateKeyBatch(input);
}

async function chargeFailedKeyTranslationRunStep(input: {
  jobId: string;
  workflowRunId: string;
  organizationId: string;
  tokenUsage: KeyTranslationTokenUsage;
}) {
  "use step";
  const { chargeFailedKeyTranslationRun } = await import("@/lib/translation/key-translation-job");
  return chargeFailedKeyTranslationRun(input);
}

async function completeKeyTranslationJobStep(input: {
  jobId: string;
  projectId: string;
  workflowRunId: string;
  organizationId: string;
  outcome: KeyTranslationJobOutcome;
  tokenUsage: KeyTranslationTokenUsage | null;
  madeModelCalls: boolean;
}) {
  "use step";
  const { completeKeyTranslationJob } = await import("@/lib/translation/key-translation-job");
  return completeKeyTranslationJob(input);
}

function sumCounts(counts: Record<string, number>) {
  return Object.values(counts).reduce((total, count) => total + count, 0);
}

/**
 * AI translation for a key job of kind `translation`: the job's strings, in small batches, each
 * through the string job's model path. It succeeds when at least one translation was saved or
 * nothing needed translating, and fails when every attempt failed.
 */
export async function keyTranslationJobWorkflow(event: TranslationJobEventData) {
  "use workflow";

  const { workflowRunId } = getWorkflowMetadata();
  const claim = await claimTranslationJobStep({ event, runId: workflowRunId });
  if (claim.kind === "skipped") {
    return claim.job;
  }
  const job = claim.job;
  const fail = (code: string, message: string, failedLocales?: string[]) =>
    failTranslationJobStep({
      jobId: job.id,
      projectId: job.projectId,
      workflowRunId: job.workflowRunId,
      code,
      message,
      failedLocales,
    });
  const recordEvents = (events: JobEventInput[]) =>
    recordJobEventsStep({ jobId: job.id, workflowRunId: job.workflowRunId, events });

  if (job.type !== "keys") {
    return fail("unsupported_job_type", `translation job type ${job.type} is not supported`);
  }

  let plan: KeyTranslationJobPlan | null = null;
  let totals: KeyTranslationBatchResult = { translated: {}, failed: {}, tokenUsage: null };
  let nextStart = 0;

  // A run that fails after its model calls answered still pays for them.
  const chargeTokens = async (current: KeyTranslationJobPlan) => {
    if (!totals.tokenUsage) return;
    await chargeFailedKeyTranslationRunStep({
      jobId: job.id,
      workflowRunId: job.workflowRunId,
      organizationId: current.organizationId,
      tokenUsage: totals.tokenUsage,
    });
  };

  // Succeeds with what was saved, charged once, or fails when nothing could be translated.
  const finish = async (current: KeyTranslationJobPlan) => {
    const { translated, failed, tokenUsage } = totals;
    const neededPerLocale: Record<string, number> = {};
    for (const item of current.items) {
      for (const locale of item.targetLocales) {
        neededPerLocale[locale] = (neededPerLocale[locale] ?? 0) + 1;
      }
    }
    const failedLocales = current.targetLocales.filter((locale) => (failed[locale] ?? 0) > 0);
    await recordEvents(
      Object.entries(neededPerLocale).map(([locale, totalCount]) => ({
        type: "locale_progress" as const,
        locale,
        payload: { translatedCount: translated[locale] ?? 0, totalCount },
      })),
    );

    const translatedTotal = sumCounts(translated);
    if (translatedTotal === 0 && sumCounts(failed) > 0) {
      if (tokenUsage) {
        await chargeTokens(current);
        return fail(
          "key_translation_rejected",
          "No string could be translated: the AI's answers were unusable or failed the checks (a copy of the source, a glossary term, a placeholder or the file's format).",
          failedLocales,
        );
      }
      return fail(
        "key_translation_failed",
        "No string could be translated. Check the workspace's model and try again.",
        failedLocales,
      );
    }

    await completeKeyTranslationJobStep({
      jobId: job.id,
      projectId: job.projectId,
      workflowRunId: job.workflowRunId,
      organizationId: current.organizationId,
      outcome: {
        kind: "key_translation_result",
        stringCount: current.stringCount,
        translated,
        failed,
      },
      tokenUsage,
      madeModelCalls: tokenUsage !== null || translatedTotal > 0,
    });
    await recordEvents([
      {
        type: "job_succeeded",
        payload: {
          completedLocales: current.targetLocales.filter(
            (locale) => !failedLocales.includes(locale),
          ),
          failedLocales,
          followUpJobId: null,
        },
      },
    ]);
    return { status: "succeeded" as const };
  };

  try {
    plan = await planKeyTranslationJobStep({ jobId: job.id, projectId: job.projectId });
    if (!plan) {
      return fail("invalid_key_translation_job_input", "invalid stored key translation job input");
    }

    const aiFeatures = await ensureAiFeaturesAllowedStep({ organizationId: plan.organizationId });
    if (!aiFeatures.ok) {
      return fail(aiFeatures.error.code, aiFeatures.error.message);
    }

    await recordEvents([
      { type: "job_started", payload: { targetLocales: plan.targetLocales } },
      {
        type: "strings_extracted",
        payload: { stringCount: plan.stringCount, localeCount: plan.targetLocales.length },
      },
    ]);

    for (let start = 0; start < plan.items.length; start += KEY_TRANSLATION_BATCH_SIZE) {
      const batch = await translateKeyBatchStep({
        jobId: job.id,
        workflowRunId: job.workflowRunId,
        plannedAt: plan.plannedAt,
        projectId: job.projectId,
        organizationId: plan.organizationId,
        sourceLocale: plan.sourceLocale,
        overwriteUnapproved: plan.overwriteUnapproved,
        knowledgeMemoryEnabled: plan.knowledgeMemoryEnabled || job.knowledgeMemoryEnabled,
        recordProvenance: start === 0,
        items: plan.items.slice(start, start + KEY_TRANSLATION_BATCH_SIZE),
      });
      totals = mergeKeyTranslationBatchResults([totals, batch]);
      nextStart = start + KEY_TRANSLATION_BATCH_SIZE;
      if (totals.stopped) {
        // Cancelled, failed by hand or handed to a retry: whoever did that owns the job now.
        return { status: "stopped" as const };
      }
    }

    return await finish(plan);
  } catch (error) {
    // Strings saved before the error stay saved, so the job succeeds with them and is charged.
    if (plan && sumCounts(totals.translated) > 0) {
      const unfinished: Record<string, number> = {};
      for (const item of plan.items.slice(nextStart)) {
        for (const locale of item.targetLocales) {
          unfinished[locale] = (unfinished[locale] ?? 0) + 1;
        }
      }
      totals = mergeKeyTranslationBatchResults([
        totals,
        { translated: {}, failed: unfinished, tokenUsage: null },
      ]);
      return finish(plan);
    }
    if (plan) await chargeTokens(plan);
    return fail(
      "translation_execution_failed",
      error instanceof Error ? error.message : "translation job execution failed",
    );
  }
}
