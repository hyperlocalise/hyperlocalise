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
import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";

import { db, schema } from "@/lib/database";
import { mapWithConcurrency } from "@/lib/primitives/map-with-concurrency/map-with-concurrency";
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";

import { dedupeAuditedPages } from "./dedupe-pages";
import { fetchAuditPage } from "./fetch-page";
import { evaluateLocalisationAudit } from "./findings";
import {
  findReportForAudit,
  fromPersistedExtraction,
  getAuditRecord,
  markAuditFailed,
  safeAuditFromRecord,
  toPersistedExtraction,
} from "./operations";
import { createReportProjections } from "./report";
import { calculateLocalisationAuditScores } from "./scoring";
import type { AuditedPage, LocalisationAuditError, SafeAudit } from "./types";
import { LOCALISATION_AUDIT_REPORT_VERSION, LOCALISATION_AUDIT_SCORE_VERSION } from "./types";

export async function runAuditWork(
  auditId: string,
): Promise<Result<SafeAudit, LocalisationAuditError>> {
  const audit = await getAuditRecord(db, auditId);
  if (!audit) {
    return err({ code: "audit_not_found", message: "The audit was not found." });
  }
  if (audit.status === "completed" || audit.status === "partial") {
    const report = await findReportForAudit(db, audit.id);
    return ok(safeAuditFromRecord(audit, report));
  }
  if (audit.status === "failed") {
    return ok(safeAuditFromRecord(audit));
  }
  if (audit.status !== "running") {
    return err({
      code: "audit_not_awaiting_confirmation",
      message: "The audit cannot be run in its current state.",
    });
  }
  if (!audit.targetLocale || !audit.targetMarket) {
    await markAuditFailed(db, audit.id, "invalid_audit_confirmation");
    return err({
      code: "audit_fetch_failed",
      message: "The audit is missing a confirmed locale or market.",
    });
  }

  const [primaryRecord] = await db
    .select()
    .from(schema.localisationAuditPages)
    .where(
      and(
        eq(schema.localisationAuditPages.auditId, audit.id),
        eq(schema.localisationAuditPages.isPrimary, true),
      ),
    )
    .limit(1);
  if (
    !primaryRecord?.extraction ||
    !primaryRecord.contentFingerprint ||
    primaryRecord.status !== "extracted"
  ) {
    await markAuditFailed(db, audit.id, "audit_fetch_failed");
    return err({
      code: "audit_fetch_failed",
      message: "The submitted page extraction is unavailable.",
    });
  }

  const primaryPage: AuditedPage = {
    url: primaryRecord.normalizedUrl,
    locale: primaryRecord.locale,
    isPrimary: true,
    status: "extracted",
    httpStatus: primaryRecord.httpStatus ?? 200,
    extracted: fromPersistedExtraction(
      primaryRecord.normalizedUrl,
      primaryRecord.contentFingerprint,
      primaryRecord.extraction,
    ),
  };
  const fetchedAlternativePages = await mapWithConcurrency(
    audit.alternatives,
    3,
    async (alternative) => {
      const result = await fetchAuditPage(alternative.url, {
        locale: alternative.locale,
        isPrimary: false,
      });
      if (isErr(result)) {
        return {
          url: alternative.url,
          locale: alternative.locale,
          isPrimary: false,
          status:
            result.error.code === "audit_url_not_public"
              ? ("blocked" as const)
              : ("failed" as const),
          failureCode: result.error.code,
        };
      }
      return result.value;
    },
  );
  const pages = dedupeAuditedPages([primaryPage, ...fetchedAlternativePages]);
  const alternativePages = pages.slice(1);
  const evaluation = evaluateLocalisationAudit({
    pages,
    targetLocale: audit.targetLocale,
    targetMarket: audit.targetMarket,
  });
  const scores = calculateLocalisationAuditScores(evaluation.rules);
  const projections = createReportProjections({
    domain: audit.domain,
    auditedAt: new Date(),
    pages,
    evaluation,
    scores,
  });
  const publicSlug = nanoid(24);

  const completed = await db.transaction(async (tx) => {
    const pageIdByUrl = new Map<string, string>([[primaryRecord.normalizedUrl, primaryRecord.id]]);
    if (alternativePages.length > 0) {
      const insertedPages = await tx
        .insert(schema.localisationAuditPages)
        .values(
          alternativePages.map((page) => ({
            auditId: audit.id,
            normalizedUrl: page.url,
            locale: page.locale,
            isPrimary: false,
            status: page.status,
            httpStatus: page.httpStatus,
            contentFingerprint:
              page.status === "extracted" ? page.extracted.contentFingerprint : undefined,
            extraction:
              page.status === "extracted" ? toPersistedExtraction(page.extracted) : undefined,
            failureCode: page.status === "extracted" ? undefined : page.failureCode,
            fetchedAt: new Date(),
          })),
        )
        .returning({
          id: schema.localisationAuditPages.id,
          normalizedUrl: schema.localisationAuditPages.normalizedUrl,
        });
      for (const page of insertedPages) {
        pageIdByUrl.set(page.normalizedUrl, page.id);
      }
    }
    if (evaluation.findings.length > 0) {
      await tx.insert(schema.localisationAuditFindings).values(
        evaluation.findings.map((auditFinding) => ({
          auditId: audit.id,
          pageId: pageIdByUrl.get(auditFinding.pageUrl),
          ruleCode: auditFinding.code,
          category: auditFinding.category,
          severity: auditFinding.severity,
          confidence: auditFinding.confidence,
          evidenceKind: auditFinding.evidenceKind,
          title: auditFinding.title,
          evidence: auditFinding.evidence,
          impact: auditFinding.impact,
          recommendation: auditFinding.recommendation,
          availablePoints: auditFinding.availablePoints,
          earnedPoints: auditFinding.earnedPoints,
          publicPreviewEligible: auditFinding.publicPreviewEligible,
        })),
      );
    }
    const [report] = await tx
      .insert(schema.localisationAuditReports)
      .values({
        auditId: audit.id,
        publicSlug,
        scoreVersion: LOCALISATION_AUDIT_SCORE_VERSION,
        reportVersion: LOCALISATION_AUDIT_REPORT_VERSION,
        publicReport: projections.publicReport,
        privateReport: projections.privateReport,
      })
      .returning({
        publicSlug: schema.localisationAuditReports.publicSlug,
        publicReport: schema.localisationAuditReports.publicReport,
      });
    if (!report) {
      throw new Error("Failed to persist localisation audit report.");
    }
    const status = projections.publicReport.status;
    const [updatedAudit] = await tx
      .update(schema.localisationAudits)
      .set({ status, completedAt: new Date() })
      .where(eq(schema.localisationAudits.id, audit.id))
      .returning();
    if (!updatedAudit) {
      throw new Error("Failed to complete localisation audit.");
    }
    await tx.insert(schema.localisationAuditEvents).values({
      auditId: audit.id,
      eventType: "completed",
      metadata: {
        findingCount: evaluation.findings.length,
        localeCount: pages.length,
      },
    });
    return safeAuditFromRecord(updatedAudit, report);
  });

  return ok(completed);
}
