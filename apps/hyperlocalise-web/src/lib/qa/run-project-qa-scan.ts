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
import { and, asc, eq, gt, inArray } from "drizzle-orm";

import { db, schema } from "@/lib/database/client";
import { createLogger } from "@/lib/log";
import { loadProjectGlossaryTerms } from "@/lib/providers/provider-job-qa/load-glossary-terms";

import { emptyTranslationQaSummary } from "./qa-report-store";
import type {
  TranslationQaCheckType,
  TranslationQaRunTrigger,
  TranslationQaSeverity,
} from "./types";
import { validateTranslationSegment } from "./validate-segment";

const logger = createLogger("translation-qa-scan");
const KEY_PAGE_SIZE = 250;
const FINDING_INSERT_CHUNK = 100;

type QaScanKeyRow = {
  translationKeyId: string;
  key: string;
  sourceText: string;
  maxLength: number | null;
  sourcePath: string | null;
};

export type TranslationQaScanResult =
  | { ok: true; runId: string }
  | { ok: false; code: "project_not_native" | "scan_in_progress" | "project_not_found" };

export async function runProjectTranslationQaScan(input: {
  organizationId: string;
  projectId: string;
  trigger: TranslationQaRunTrigger;
  createdByUserId?: string | null;
}): Promise<TranslationQaScanResult> {
  const [project] = await db
    .select({
      id: schema.projects.id,
      source: schema.projects.source,
      sourceLocale: schema.projects.sourceLocale,
      targetLocales: schema.projects.targetLocales,
    })
    .from(schema.projects)
    .where(
      and(
        eq(schema.projects.organizationId, input.organizationId),
        eq(schema.projects.id, input.projectId),
      ),
    )
    .limit(1);

  if (!project) {
    return { ok: false, code: "project_not_found" };
  }
  if (project.source !== "native") {
    return { ok: false, code: "project_not_native" };
  }

  const run = await claimTranslationQaRun(input);
  if (!run.ok) {
    return run;
  }

  try {
    const glossaryTerms = await loadProjectGlossaryTerms({
      organizationId: input.organizationId,
      projectId: input.projectId,
      sourceLocale: project.sourceLocale,
      targetLocales: project.targetLocales,
    });

    let segmentCount = 0;
    let findingCount = 0;
    let errorCount = 0;
    let warningCount = 0;
    const byCheckType: Partial<Record<TranslationQaCheckType, number>> = {};
    const bySeverity: Partial<Record<TranslationQaSeverity, number>> = {};
    const byLocale: Record<string, number> = {};
    let pendingFindings: Array<typeof schema.translationQaFindings.$inferInsert> = [];
    const locales = uniqueSortedLocales(project.targetLocales);

    async function flushFindings() {
      if (pendingFindings.length === 0) {
        return;
      }
      await db.insert(schema.translationQaFindings).values(pendingFindings);
      pendingFindings = [];
    }

    let afterKeyId: string | null = null;

    for (;;) {
      const keys: QaScanKeyRow[] = await db
        .select({
          translationKeyId: schema.projectTranslationKeys.id,
          key: schema.projectTranslationKeys.key,
          sourceText: schema.projectTranslationKeys.sourceText,
          maxLength: schema.projectTranslationKeys.maxLength,
          sourcePath: schema.repositorySourceFiles.sourcePath,
        })
        .from(schema.projectTranslationKeys)
        .leftJoin(
          schema.repositorySourceFiles,
          eq(schema.projectTranslationKeys.repositorySourceFileId, schema.repositorySourceFiles.id),
        )
        .where(
          and(
            eq(schema.projectTranslationKeys.organizationId, input.organizationId),
            eq(schema.projectTranslationKeys.projectId, input.projectId),
            eq(schema.projectTranslationKeys.isHidden, false),
            afterKeyId ? gt(schema.projectTranslationKeys.id, afterKeyId) : undefined,
          ),
        )
        .orderBy(asc(schema.projectTranslationKeys.id))
        .limit(KEY_PAGE_SIZE);

      if (keys.length === 0) {
        break;
      }

      const translations =
        locales.length === 0
          ? []
          : await db
              .select({
                id: schema.projectTranslations.id,
                translationKeyId: schema.projectTranslations.translationKeyId,
                targetLocale: schema.projectTranslations.targetLocale,
                text: schema.projectTranslations.text,
              })
              .from(schema.projectTranslations)
              .where(
                and(
                  eq(schema.projectTranslations.organizationId, input.organizationId),
                  eq(schema.projectTranslations.projectId, input.projectId),
                  inArray(
                    schema.projectTranslations.translationKeyId,
                    keys.map((row) => row.translationKeyId),
                  ),
                  inArray(schema.projectTranslations.targetLocale, locales),
                ),
              );

      const translationByKeyLocale = new Map(
        translations.map((row) => [`${row.translationKeyId}\0${row.targetLocale}`, row]),
      );

      for (const key of keys) {
        for (const targetLocale of locales) {
          segmentCount += 1;
          const translation = translationByKeyLocale.get(
            `${key.translationKeyId}\0${targetLocale}`,
          );
          const targetText = translation?.text ?? "";
          const checks = validateTranslationSegment({
            sourceText: key.sourceText,
            targetText,
            sourcePath: key.sourcePath,
            maxLength: key.maxLength,
            targetLocale,
            glossaryTerms,
          });

          for (const check of checks) {
            findingCount += 1;
            if (check.severity === "error") {
              errorCount += 1;
            } else {
              warningCount += 1;
            }
            byCheckType[check.checkType] = (byCheckType[check.checkType] ?? 0) + 1;
            bySeverity[check.severity] = (bySeverity[check.severity] ?? 0) + 1;
            byLocale[targetLocale] = (byLocale[targetLocale] ?? 0) + 1;
            pendingFindings.push({
              runId: run.runId,
              organizationId: input.organizationId,
              projectId: input.projectId,
              translationKeyId: key.translationKeyId,
              translationId: translation?.id ?? null,
              sourcePath: key.sourcePath,
              key: key.key,
              targetLocale,
              checkType: check.checkType,
              severity: check.severity,
              category: check.category,
              message: check.message,
              relatedTokens: check.relatedTokens,
              sourceText: key.sourceText,
              targetText,
            });
            if (pendingFindings.length >= FINDING_INSERT_CHUNK) {
              await flushFindings();
            }
          }
        }
      }

      afterKeyId = keys[keys.length - 1]?.translationKeyId ?? null;
      if (keys.length < KEY_PAGE_SIZE) {
        break;
      }
    }

    await flushFindings();

    const completedAt = new Date();
    await db
      .update(schema.translationQaRuns)
      .set({
        status: "succeeded",
        segmentCount,
        findingCount,
        errorCount,
        warningCount,
        summary: { byCheckType, bySeverity, byLocale },
        completedAt,
      })
      .where(eq(schema.translationQaRuns.id, run.runId));

    await db
      .update(schema.projects)
      .set({ qaScanLastRunAt: completedAt })
      .where(
        and(
          eq(schema.projects.organizationId, input.organizationId),
          eq(schema.projects.id, input.projectId),
        ),
      );

    logger.info(
      {
        runId: run.runId,
        projectId: input.projectId,
        segmentCount,
        findingCount,
        trigger: input.trigger,
      },
      "translation qa scan completed",
    );

    return { ok: true, runId: run.runId };
  } catch (error) {
    await db
      .update(schema.translationQaRuns)
      .set({
        status: "failed",
        errorCode: "qa_scan_failed",
        errorMessage: error instanceof Error ? error.message : "qa scan failed",
        completedAt: new Date(),
      })
      .where(eq(schema.translationQaRuns.id, run.runId));

    logger.info({ runId: run.runId, projectId: input.projectId }, "translation qa scan failed");
    throw error;
  }
}

async function claimTranslationQaRun(input: {
  organizationId: string;
  projectId: string;
  trigger: TranslationQaRunTrigger;
  createdByUserId?: string | null;
}): Promise<TranslationQaScanResult> {
  try {
    const [run] = await db
      .insert(schema.translationQaRuns)
      .values({
        organizationId: input.organizationId,
        projectId: input.projectId,
        trigger: input.trigger,
        status: "running",
        createdByUserId: input.createdByUserId ?? null,
        summary: emptyTranslationQaSummary(),
        startedAt: new Date(),
      })
      .returning({ id: schema.translationQaRuns.id });

    if (!run) {
      return { ok: false, code: "project_not_found" };
    }
    return { ok: true, runId: run.id };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, code: "scan_in_progress" };
    }
    throw error;
  }
}

function uniqueSortedLocales(locales: readonly string[]) {
  return [...new Set(locales)].toSorted();
}

function isUniqueViolation(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }
  if ("code" in error && error.code === "23505") {
    return true;
  }
  const cause = "cause" in error ? error.cause : undefined;
  return typeof cause === "object" && cause !== null && "code" in cause && cause.code === "23505";
}
