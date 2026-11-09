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
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import {
  completeAndTrackBillableUsage,
  formatUsageControlError,
  trackAiCreditUsageInAutumn,
} from "@/lib/billing/usage-control";
import { db, schema } from "@/lib/database/client";
import { updateJobs } from "@/lib/job-change-events/job-writes";
import { mapWithConcurrency } from "@/lib/primitives/map-with-concurrency/map-with-concurrency";
import { isErr } from "@/lib/primitives/result/results";
import {
  projectTranslationRevisionColumns,
  recordProjectTranslationRevisions,
  writeProjectTranslations,
} from "@/lib/projects/translations/project-translation-revisions";
import {
  defaultGlossaryMatchResolution,
  defaultTranslationMemoryMatchResolution,
} from "@/lib/providers/capabilities/match-resolution";
import {
  checkTranslation,
  isUntranslatedCopy,
  withRetryFeedback,
} from "@/lib/translation/accept-translations";
import { TranslationContextBuilder } from "@/lib/translation/context";
import type { StringTranslationJobResult } from "@/lib/translation/domain";
import { resolveWorkspaceKnowledgeFlag } from "@/lib/flags/workspace-flags";
import {
  OrganizationModelResolver,
  StringTranslationOutputError,
} from "@/lib/translation/generation";
import {
  addTokenUsage,
  type KeyTranslationBatchResult,
  type KeyTranslationJobOutcome,
  type KeyTranslationTokenUsage,
} from "@/lib/translation/key-translation-job-results";
import { generationModelFromGatewayId } from "@/lib/translation/generation-provenance";
import { recordJobGenerationProvenance } from "@/lib/translation/generation-provenance-store";

/** Model calls in flight at once within a batch. */
const KEY_TRANSLATION_CONCURRENCY = 4;

const keyTranslationJobInputSchema = z.object({
  sourceLocale: z.string().min(1),
  targetLocales: z.array(z.string().min(1)).min(1),
  overwriteUnapproved: z.boolean().optional(),
});

export type KeyTranslationJobPlan = {
  organizationId: string;
  sourceLocale: string;
  targetLocales: string[];
  overwriteUnapproved: boolean;
  /** Each string with the languages it still needs. Strings that need none are left out. */
  items: Array<{ translationKeyId: string; targetLocales: string[] }>;
  stringCount: number;
  /** Database time of the plan. A translation changed after it was written by someone else. */
  plannedAt: string;
  knowledgeMemoryEnabled: boolean;
};

/**
 * Whether a job may write a translation in this state. A Needs review copy of the source is no
 * translation, so it counts as missing, as in the file job's prefill.
 */
function isWritable(
  existing: { text: string; status: string } | undefined,
  overwriteUnapproved: boolean,
  copy: { sourceText: string; sourceLocale: string; targetLocale: string },
) {
  if (!existing) return true;
  if (existing.status === "approved") return false;
  if (overwriteUnapproved || existing.text.trim() === "") return true;
  return (
    existing.status === "needs_review" &&
    isUntranslatedCopy({ ...copy, translatedText: existing.text })
  );
}

/**
 * Whether the job still runs under this workflow run. A cancel, a manual fail or a retry hands the
 * job to no run or another one, and this run must then stop writing.
 */
async function ownsJob(
  database: Pick<typeof db, "select">,
  input: { jobId: string; workflowRunId: string },
  lock = false,
) {
  const query = database
    .select({ id: schema.jobs.id })
    .from(schema.jobs)
    .where(
      and(
        eq(schema.jobs.id, input.jobId),
        eq(schema.jobs.status, "running"),
        eq(schema.jobs.workflowRunId, input.workflowRunId),
      ),
    )
    .limit(1);
  const rows = lock ? await query.for("share") : await query;
  return rows.length > 0;
}

function lockKey(translationKeyId: string, targetLocale: string) {
  return `${translationKeyId}\u0000${targetLocale}`;
}

async function loadLocks(input: {
  organizationId: string;
  projectId: string;
  translationKeyIds: string[];
  targetLocales: string[];
  database?: Pick<typeof db, "select">;
}) {
  const locks = schema.projectContentEditorSegmentLocks;
  const rows = await (input.database ?? db)
    .select({ externalStringId: locks.externalStringId, targetLocale: locks.targetLocale })
    .from(locks)
    .where(
      and(
        eq(locks.organizationId, input.organizationId),
        eq(locks.projectId, input.projectId),
        inArray(locks.externalStringId, input.translationKeyIds),
        inArray(locks.targetLocale, input.targetLocales),
      ),
    );
  return new Set(rows.map((row) => lockKey(row.externalStringId, row.targetLocale)));
}

/**
 * Lists the job's visible strings and, for each, the languages it may write: missing or empty
 * translations, or with `overwriteUnapproved` any that are not approved, and never a language
 * the string is locked in.
 */
export async function planKeyTranslationJob(input: {
  jobId: string;
  projectId: string;
}): Promise<KeyTranslationJobPlan | null> {
  const [job] = await db
    .select({ organizationId: schema.jobs.organizationId, inputPayload: schema.jobs.inputPayload })
    .from(schema.jobs)
    .where(and(eq(schema.jobs.id, input.jobId), eq(schema.jobs.projectId, input.projectId)))
    .limit(1);
  const parsed = keyTranslationJobInputSchema.safeParse(job?.inputPayload);
  if (!job || !parsed.success) {
    return null;
  }
  const { sourceLocale, targetLocales } = parsed.data;
  const overwriteUnapproved = parsed.data.overwriteUnapproved === true;
  const plannedAt = (await db.execute<{ now: string }>(sql`select now()::text as now`)).rows[0]!
    .now;
  const knowledgeMemoryEnabled = await resolveWorkspaceKnowledgeFlag({
    organizationId: job.organizationId,
  }).catch(() => false);

  const keys = schema.projectTranslationKeys;
  const rows = await db
    .select({ id: keys.id, sourceText: keys.sourceText })
    .from(schema.translationJobKeys)
    .innerJoin(keys, eq(keys.id, schema.translationJobKeys.translationKeyId))
    .where(
      and(
        eq(schema.translationJobKeys.jobId, input.jobId),
        eq(keys.organizationId, job.organizationId),
        eq(keys.projectId, input.projectId),
        eq(keys.isHidden, false),
      ),
    )
    .orderBy(keys.id);
  const keyIds = rows.map((row) => row.id);
  if (keyIds.length === 0) {
    return {
      organizationId: job.organizationId,
      sourceLocale,
      targetLocales,
      overwriteUnapproved,
      items: [],
      stringCount: 0,
      plannedAt,
      knowledgeMemoryEnabled,
    };
  }

  const existing = new Map<string, { text: string; status: string }>();
  const translations = schema.projectTranslations;
  const existingRows = await db
    .select({
      translationKeyId: translations.translationKeyId,
      targetLocale: translations.targetLocale,
      text: translations.text,
      status: translations.status,
    })
    .from(translations)
    .where(
      and(
        eq(translations.organizationId, job.organizationId),
        inArray(translations.translationKeyId, keyIds),
        inArray(translations.targetLocale, targetLocales),
      ),
    );
  for (const row of existingRows) {
    existing.set(lockKey(row.translationKeyId, row.targetLocale), row);
  }
  const locked = await loadLocks({
    organizationId: job.organizationId,
    projectId: input.projectId,
    translationKeyIds: keyIds,
    targetLocales,
  });

  const items: KeyTranslationJobPlan["items"] = [];
  for (const { id: translationKeyId, sourceText } of rows) {
    const needed = targetLocales.filter((locale) => {
      const id = lockKey(translationKeyId, locale);
      return (
        !locked.has(id) &&
        isWritable(existing.get(id), overwriteUnapproved, {
          sourceText,
          sourceLocale,
          targetLocale: locale,
        })
      );
    });
    if (needed.length > 0) {
      items.push({ translationKeyId, targetLocales: needed });
    }
  }

  return {
    organizationId: job.organizationId,
    sourceLocale,
    targetLocales,
    overwriteUnapproved,
    items,
    stringCount: keyIds.length,
    plannedAt,
    knowledgeMemoryEnabled,
  };
}

/**
 * Saves one string's machine translations as Needs review. The rules of `planKeyTranslationJob`
 * are checked again under the key lock, and a translation someone else changed after the plan is
 * kept, so work approved, typed or locked while the job ran survives. Returns the languages
 * written, or null when the job no longer runs under this workflow run.
 */
export async function persistKeyJobTranslations(input: {
  organizationId: string;
  projectId: string;
  jobId: string;
  workflowRunId: string;
  plannedAt: string;
  translationKeyId: string;
  sourceLocale: string;
  overwriteUnapproved: boolean;
  translations: Array<{ locale: string; text: string }>;
}): Promise<string[] | null> {
  const candidates = input.translations.filter((translation) => translation.text.trim() !== "");
  if (candidates.length === 0) {
    return [];
  }
  const targetLocales = candidates.map((translation) => translation.locale);

  return writeProjectTranslations(
    db,
    {
      organizationId: input.organizationId,
      translationKeyIds: [input.translationKeyId],
      targetLocales,
    },
    async (tx, before) => {
      // Held until the write commits, so a cancel can't slip in between the check and the write.
      if (!(await ownsJob(tx, input, true))) {
        return null;
      }
      const [key] = await tx
        .select({
          isHidden: schema.projectTranslationKeys.isHidden,
          sourceText: schema.projectTranslationKeys.sourceText,
        })
        .from(schema.projectTranslationKeys)
        .where(
          and(
            eq(schema.projectTranslationKeys.id, input.translationKeyId),
            eq(schema.projectTranslationKeys.organizationId, input.organizationId),
            eq(schema.projectTranslationKeys.projectId, input.projectId),
          ),
        )
        .limit(1);
      if (!key || key.isHidden) {
        return [];
      }

      const current = new Map([...before.values()].map((row) => [row.targetLocale, row] as const));
      const locked = await loadLocks({
        organizationId: input.organizationId,
        projectId: input.projectId,
        translationKeyIds: [input.translationKeyId],
        targetLocales,
        database: tx,
      });
      const plannedAt = new Date(input.plannedAt);
      const writable = candidates.filter((translation) => {
        const existing = current.get(translation.locale);
        const changedSincePlan =
          existing !== undefined &&
          existing.sourceJobId !== input.jobId &&
          existing.updatedAt > plannedAt;
        return (
          !changedSincePlan &&
          !locked.has(lockKey(input.translationKeyId, translation.locale)) &&
          isWritable(existing, input.overwriteUnapproved, {
            sourceText: key.sourceText,
            sourceLocale: input.sourceLocale,
            targetLocale: translation.locale,
          })
        );
      });
      if (writable.length === 0) {
        return [];
      }

      const saved = await tx
        .insert(schema.projectTranslations)
        .values(
          writable.map((translation) => ({
            organizationId: input.organizationId,
            projectId: input.projectId,
            translationKeyId: input.translationKeyId,
            targetLocale: translation.locale,
            text: translation.text,
            status: "needs_review" as const,
            provenance: "translation_job" as const,
            origin: "machine" as const,
            sourceJobId: input.jobId,
          })),
        )
        .onConflictDoUpdate({
          target: [
            schema.projectTranslations.translationKeyId,
            schema.projectTranslations.targetLocale,
          ],
          set: {
            text: sql`excluded.text`,
            status: sql`excluded.status`,
            provenance: sql`excluded.provenance`,
            origin: sql`excluded.origin`,
            sourceJobId: sql`excluded.source_job_id`,
            reviewedAt: null,
            reviewedByUserId: null,
            updatedAt: new Date(),
          },
        })
        .returning(projectTranslationRevisionColumns);
      await recordProjectTranslationRevisions(tx, { before, saved });
      return writable.map((translation) => translation.locale);
    },
  );
}

/**
 * Translates a batch of the job's strings through the string job's path (context builder and
 * the workspace's model), one model call per string for all the languages it needs, and saves
 * each result as it arrives. Each answer passes the accept checks (`accept-translations.ts`);
 * languages that came back unusable or failed a check get one retry with the problems described.
 * A string that fails counts as failed in its languages; the others carry on.
 */
export async function translateKeyBatch(input: {
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
  const result: KeyTranslationBatchResult = { translated: {}, failed: {}, tokenUsage: null };
  const countFailed = (locales: string[]) => {
    for (const locale of locales) {
      result.failed[locale] = (result.failed[locale] ?? 0) + 1;
    }
  };
  if (input.items.length === 0) {
    return result;
  }
  if (!(await ownsJob(db, input))) {
    return { ...result, stopped: true };
  }

  const keys = schema.projectTranslationKeys;
  const files = schema.repositorySourceFiles;
  const keyRows = await db
    .select({
      id: keys.id,
      sourceText: keys.sourceText,
      context: keys.context,
      maxLength: keys.maxLength,
      isHidden: keys.isHidden,
      sourcePath: files.sourcePath,
      messageFormat: files.messageFormat,
      placeholderPatterns: files.placeholderPatterns,
    })
    .from(keys)
    .leftJoin(files, eq(files.id, keys.repositorySourceFileId))
    .where(
      and(
        eq(keys.organizationId, input.organizationId),
        eq(keys.projectId, input.projectId),
        inArray(
          keys.id,
          input.items.map((item) => item.translationKeyId),
        ),
      ),
    );
  const keysById = new Map(keyRows.map((row) => [row.id, row] as const));

  const generator = await new OrganizationModelResolver().resolve(input.projectId);
  if (!generator.ok) {
    // The workspace's model can't be reached; no call was made for this batch.
    countFailed(input.items.flatMap((item) => item.targetLocales));
    return result;
  }
  const contextBuilder = new TranslationContextBuilder();
  let provenancePending = input.recordProvenance;

  await mapWithConcurrency(input.items, KEY_TRANSLATION_CONCURRENCY, async (item) => {
    const key = keysById.get(item.translationKeyId);
    if (result.stopped || !key || key.isHidden || !key.sourceText.trim()) {
      return;
    }
    try {
      const context = await contextBuilder.build(
        input.projectId,
        {
          sourceText: key.sourceText,
          sourceLocale: input.sourceLocale,
          targetLocales: item.targetLocales,
          translationKeyId: key.id,
          ...(key.context?.trim() ? { context: key.context } : {}),
          ...(key.maxLength ? { maxLength: key.maxLength } : {}),
        },
        undefined,
        {
          knowledgeMemoryEnabled: input.knowledgeMemoryEnabled,
          translationMemoryMatchResolution: defaultTranslationMemoryMatchResolution,
          glossaryMatchResolution: defaultGlossaryMatchResolution,
        },
      );
      if (!context.ok) {
        console.warn("[key-translation-job] translation context could not be built", {
          jobId: input.jobId,
          translationKeyId: item.translationKeyId,
        });
        countFailed(item.targetLocales);
        return;
      }
      if (provenancePending) {
        provenancePending = false;
        await recordJobGenerationProvenance(input.jobId, {
          model: generationModelFromGatewayId(generator.modelId, generator.credentialSource),
          ...context.use,
          customInstructions: false,
        });
      }

      const request = context.context.toStringTranslationInput(
        generator.project.name,
        generator.project.translationContext,
      );
      const accepted = new Map<string, string>();
      // Calls the model for some of the string's languages, keeps the answers that pass the
      // checks, and returns the problems of those worth a retry. On the retry an answer whose
      // only problem is a glossary term is kept for review.
      const translate = async (targetLocales: string[], retryContext?: string) => {
        let translation: StringTranslationJobResult;
        const retry = new Map<string, string[]>();
        try {
          translation = await generator.translateStringJob({
            ...request,
            jobInput: {
              ...request.jobInput,
              targetLocales,
              ...(retryContext ? { context: retryContext } : {}),
            },
          });
        } catch (error) {
          if (!(error instanceof StringTranslationOutputError)) throw error;
          // The call was made, so its tokens count, and the languages that came back fine are kept.
          console.warn("[key-translation-job] part of a string translation was unusable", {
            jobId: input.jobId,
            translationKeyId: item.translationKeyId,
            error: error.message,
          });
          translation = { translations: error.validTranslations, tokenUsage: error.tokenUsage };
          for (const [locale, problem] of error.localeProblems) {
            if (targetLocales.includes(locale)) retry.set(locale, [problem]);
          }
        }
        result.tokenUsage = addTokenUsage(result.tokenUsage, translation.tokenUsage);

        const answers = translation.translations.filter(
          (entry) => targetLocales.includes(entry.locale) && entry.text.trim() !== "",
        );
        for (const locale of targetLocales) {
          if (!retry.has(locale) && !answers.some((entry) => entry.locale === locale)) {
            retry.set(locale, ["No translation came back."]);
          }
        }
        const checks = await Promise.all(
          answers.map((entry) =>
            checkTranslation({
              sourceText: key.sourceText,
              translatedText: entry.text,
              sourceLocale: input.sourceLocale,
              targetLocale: entry.locale,
              glossaryTerms: context.context.glossaryTerms,
              sourcePath: key.sourcePath,
              messageFormat: key.messageFormat,
              placeholderPatterns: key.placeholderPatterns,
            }),
          ),
        );
        answers.forEach((entry, index) => {
          const check = checks[index]!;
          if (check.ok || (retryContext && !check.blocking)) {
            accepted.set(entry.locale, entry.text);
            return;
          }
          if (!retryContext) {
            retry.set(entry.locale, check.problems);
            return;
          }
          // The answer's text and problems can hold customer text, so only the reason is logged.
          console.warn("[key-translation-job] answer rejected after the retry", {
            jobId: input.jobId,
            translationKeyId: item.translationKeyId,
            locale: entry.locale,
            reason: check.copy ? "copy_of_source" : "failed_checks",
          });
        });
        return retry;
      };

      const retry = await translate(item.targetLocales);
      if (retry.size > 0) {
        // No retry call once the job is no longer this run's, so Cancel stops the work.
        if (result.stopped || !(await ownsJob(db, input))) {
          result.stopped = true;
          return;
        }
        // Whatever the retry gets wrong again stays failed; a retry that errors keeps what passed.
        await translate(
          [...retry.keys()],
          withRetryFeedback(request.jobInput.context, retry),
        ).catch((error: unknown) => {
          console.warn("[key-translation-job] retry of a string translation failed", {
            jobId: input.jobId,
            translationKeyId: item.translationKeyId,
            error: error instanceof Error ? error.message : "unknown error",
          });
        });
      }

      const written = await persistKeyJobTranslations({
        organizationId: input.organizationId,
        projectId: input.projectId,
        jobId: input.jobId,
        workflowRunId: input.workflowRunId,
        plannedAt: input.plannedAt,
        translationKeyId: key.id,
        sourceLocale: input.sourceLocale,
        overwriteUnapproved: input.overwriteUnapproved,
        translations: [...accepted].map(([locale, text]) => ({ locale, text })),
      });
      if (written === null) {
        result.stopped = true;
        return;
      }
      for (const locale of written) {
        result.translated[locale] = (result.translated[locale] ?? 0) + 1;
      }
      // A language with no accepted text failed; one kept because someone wrote it meanwhile did not.
      countFailed(item.targetLocales.filter((locale) => !accepted.has(locale)));
    } catch (error) {
      console.warn("[key-translation-job] string translation failed", {
        jobId: input.jobId,
        translationKeyId: item.translationKeyId,
        error: error instanceof Error ? error.message : "unknown error",
      });
      countFailed(item.targetLocales);
    }
  });

  return result;
}

/**
 * Marks the job succeeded and charges it once: the reserved translation job and the tokens of
 * every model call. A job that made no model call is not charged.
 */
export async function completeKeyTranslationJob(input: {
  jobId: string;
  projectId: string;
  workflowRunId: string;
  organizationId: string;
  outcome: KeyTranslationJobOutcome;
  tokenUsage: KeyTranslationTokenUsage | null;
  madeModelCalls: boolean;
}) {
  const [updated] = await updateJobs(db, {
    set: {
      status: "succeeded",
      outcomePayload: input.outcome,
      lastError: null,
      completedAt: new Date(),
    },
    where: and(
      eq(schema.jobs.kind, "translation"),
      eq(schema.jobs.id, input.jobId),
      eq(schema.jobs.projectId, input.projectId),
      eq(schema.jobs.workflowRunId, input.workflowRunId),
    ),
    returning: { id: schema.jobs.id },
  });
  if (!updated) {
    throw new Error(
      `translation job ${input.jobId} is not owned by workflow run ${input.workflowRunId}`,
    );
  }
  if (!input.madeModelCalls) {
    return;
  }

  const operationKey = `job:${input.jobId}:translation_jobs`;
  const trackUsageResult = await completeAndTrackBillableUsage({
    organizationId: input.organizationId,
    operationKey,
    autumnEventName: "translation_job.completed",
    unit: "job",
    tokenUsage: input.tokenUsage,
    aiCreditModelId: input.tokenUsage?.modelId,
    aiCreditCredentialSource: input.tokenUsage?.credentialSource,
    jobId: input.jobId,
    aiCreditSource: "translation_job_complete",
  });
  if (isErr(trackUsageResult)) {
    console.error("[key-translation-job] Autumn usage tracking failed after job succeeded", {
      jobId: input.jobId,
      operationKey,
      error: formatUsageControlError(trackUsageResult.error),
    });
  }
}

/**
 * Charges the AI tokens of a run that ends failed although its model calls answered, as when
 * every answer failed the checks. The job itself is not charged; each run is charged once.
 */
export async function chargeFailedKeyTranslationRun(input: {
  jobId: string;
  workflowRunId: string;
  organizationId: string;
  tokenUsage: KeyTranslationTokenUsage;
}) {
  const parentOperationKey = `job:${input.jobId}:run:${input.workflowRunId}`;
  const result = await trackAiCreditUsageInAutumn({
    organizationId: input.organizationId,
    parentOperationKey,
    tokenUsage: input.tokenUsage,
    source: "translation_job_failed",
    modelId: input.tokenUsage.modelId,
    credentialSource: input.tokenUsage.credentialSource,
    jobId: input.jobId,
  });
  if (isErr(result)) {
    console.error("[key-translation-job] AI credit tracking failed for a failed run", {
      jobId: input.jobId,
      operationKey: parentOperationKey,
      error: formatUsageControlError(result.error),
    });
  }
}
