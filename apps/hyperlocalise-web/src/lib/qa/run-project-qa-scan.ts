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
import { and, asc, eq, gt, or } from "drizzle-orm";

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
const SEGMENT_PAGE_SIZE = 250;
const FINDING_INSERT_CHUNK = 100;

type QaScanSegmentRow = {
  translationId: string;
  translationKeyId: string;
  key: string;
  sourceText: string;
  maxLength: number | null;
  targetLocale: string;
  targetText: string;
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

  const [active] = await db
    .select({ id: schema.translationQaRuns.id })
    .from(schema.translationQaRuns)
    .where(
      and(
        eq(schema.translationQaRuns.organizationId, input.organizationId),
        eq(schema.translationQaRuns.projectId, input.projectId),
        eq(schema.translationQaRuns.status, "running"),
      ),
    )
    .limit(1);
  if (active) {
    return { ok: false, code: "scan_in_progress" };
  }

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

    async function flushFindings() {
      if (pendingFindings.length === 0) {
        return;
      }
      await db.insert(schema.translationQaFindings).values(pendingFindings);
      pendingFindings = [];
    }

    let afterKeyId: string | null = null;
    let afterLocale: string | null = null;

    for (;;) {
      const rows: QaScanSegmentRow[] = await db
        .select({
          translationId: schema.projectTranslations.id,
          translationKeyId: schema.projectTranslationKeys.id,
          key: schema.projectTranslationKeys.key,
          sourceText: schema.projectTranslationKeys.sourceText,
          maxLength: schema.projectTranslationKeys.maxLength,
          targetLocale: schema.projectTranslations.targetLocale,
          targetText: schema.projectTranslations.text,
          sourcePath: schema.repositorySourceFiles.sourcePath,
        })
        .from(schema.projectTranslations)
        .innerJoin(
          schema.projectTranslationKeys,
          eq(schema.projectTranslations.translationKeyId, schema.projectTranslationKeys.id),
        )
        .leftJoin(
          schema.repositorySourceFiles,
          eq(schema.projectTranslationKeys.repositorySourceFileId, schema.repositorySourceFiles.id),
        )
        .where(
          and(
            eq(schema.projectTranslations.organizationId, input.organizationId),
            eq(schema.projectTranslations.projectId, input.projectId),
            eq(schema.projectTranslationKeys.isHidden, false),
            afterKeyId && afterLocale ? sqlKeyLocaleCursor(afterKeyId, afterLocale) : undefined,
          ),
        )
        .orderBy(
          asc(schema.projectTranslationKeys.id),
          asc(schema.projectTranslations.targetLocale),
        )
        .limit(SEGMENT_PAGE_SIZE);

      if (rows.length === 0) {
        break;
      }

      for (const row of rows) {
        segmentCount += 1;
        const checks = validateTranslationSegment({
          sourceText: row.sourceText,
          targetText: row.targetText,
          sourcePath: row.sourcePath,
          maxLength: row.maxLength,
          targetLocale: row.targetLocale,
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
          byLocale[row.targetLocale] = (byLocale[row.targetLocale] ?? 0) + 1;
          pendingFindings.push({
            runId: run.id,
            organizationId: input.organizationId,
            projectId: input.projectId,
            translationKeyId: row.translationKeyId,
            translationId: row.translationId,
            sourcePath: row.sourcePath,
            key: row.key,
            targetLocale: row.targetLocale,
            checkType: check.checkType,
            severity: check.severity,
            category: check.category,
            message: check.message,
            relatedTokens: check.relatedTokens,
            sourceText: row.sourceText,
            targetText: row.targetText,
          });
          if (pendingFindings.length >= FINDING_INSERT_CHUNK) {
            await flushFindings();
          }
        }
      }

      const last = rows[rows.length - 1];
      afterKeyId = last?.translationKeyId ?? null;
      afterLocale = last?.targetLocale ?? null;
      if (rows.length < SEGMENT_PAGE_SIZE) {
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
      .where(eq(schema.translationQaRuns.id, run.id));

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
        runId: run.id,
        projectId: input.projectId,
        segmentCount,
        findingCount,
        trigger: input.trigger,
      },
      "translation qa scan completed",
    );

    return { ok: true, runId: run.id };
  } catch (error) {
    await db
      .update(schema.translationQaRuns)
      .set({
        status: "failed",
        errorCode: "qa_scan_failed",
        errorMessage: error instanceof Error ? error.message : "qa scan failed",
        completedAt: new Date(),
      })
      .where(eq(schema.translationQaRuns.id, run.id));

    logger.info({ runId: run.id, projectId: input.projectId }, "translation qa scan failed");
    throw error;
  }
}

function sqlKeyLocaleCursor(afterKeyId: string, afterLocale: string) {
  return or(
    gt(schema.projectTranslationKeys.id, afterKeyId),
    and(
      eq(schema.projectTranslationKeys.id, afterKeyId),
      gt(schema.projectTranslations.targetLocale, afterLocale),
    ),
  );
}
