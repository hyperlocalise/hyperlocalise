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
import { createHmac } from "node:crypto";

import { eq } from "drizzle-orm";

import { type DatabaseClient, schema } from "@/lib/database";
import type {
  LocalisationAuditPageExtractionData,
  LocalisationAuditReportData,
} from "@/lib/database/schema/localisation-audit";

import { sanitizeAuditExcerpt } from "./parser";
import type { ExtractedPage, PrivateAuditReport, SafeAudit } from "./types";

export const MAX_PERSISTED_VISIBLE_TEXT = 2_000;

export type AuditRecord = typeof schema.localisationAudits.$inferSelect;

export function hashBudgetKey(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("hex");
}

export function toPersistedExtraction(
  extracted: ExtractedPage,
): LocalisationAuditPageExtractionData {
  return {
    htmlLang: extracted.htmlLang,
    title: extracted.title,
    description: extracted.description,
    canonicalUrl: extracted.canonicalUrl,
    alternateLinks: extracted.alternateLinks,
    headings: extracted.headings,
    navigation: extracted.navigation,
    callsToAction: extracted.callsToAction,
    visibleTextSample: sanitizeAuditExcerpt(extracted.visibleText, MAX_PERSISTED_VISIBLE_TEXT),
  };
}

export function fromPersistedExtraction(
  url: string,
  fingerprint: string,
  extraction: LocalisationAuditPageExtractionData,
): ExtractedPage {
  return {
    url,
    htmlLang: extraction.htmlLang,
    title: extraction.title,
    description: extraction.description,
    canonicalUrl: extraction.canonicalUrl,
    alternateLinks: extraction.alternateLinks,
    headings: extraction.headings,
    navigation: extraction.navigation,
    callsToAction: extraction.callsToAction,
    visibleText: extraction.visibleTextSample,
    contentFingerprint: fingerprint,
  };
}

export function safeAuditFromRecord(
  audit: AuditRecord,
  report?: {
    publicSlug: string;
    publicReport: LocalisationAuditReportData;
  } | null,
): SafeAudit {
  return {
    id: audit.id,
    status: audit.status,
    detectedLocale: audit.detectedLocale,
    alternatives: audit.alternatives,
    targetLocale: audit.targetLocale,
    targetMarket: audit.targetMarket,
    ...(report
      ? {
          publicSlug: report.publicSlug,
          summary: report.publicReport,
        }
      : {}),
  };
}

export async function findReportForAudit(
  client: DatabaseClient,
  auditId: string,
): Promise<{
  id: string;
  publicSlug: string;
  publicReport: LocalisationAuditReportData;
  privateReport: PrivateAuditReport;
} | null> {
  const [report] = await client
    .select({
      id: schema.localisationAuditReports.id,
      publicSlug: schema.localisationAuditReports.publicSlug,
      publicReport: schema.localisationAuditReports.publicReport,
      privateReport: schema.localisationAuditReports.privateReport,
    })
    .from(schema.localisationAuditReports)
    .where(eq(schema.localisationAuditReports.auditId, auditId))
    .limit(1);
  return report ?? null;
}

export async function getAuditRecord(
  client: DatabaseClient,
  auditId: string,
): Promise<AuditRecord | null> {
  const [audit] = await client
    .select()
    .from(schema.localisationAudits)
    .where(eq(schema.localisationAudits.id, auditId))
    .limit(1);
  return audit ?? null;
}

export async function markAuditFailed(
  client: DatabaseClient,
  auditId: string,
  failureCode: string,
): Promise<void> {
  await client
    .update(schema.localisationAudits)
    .set({ status: "failed", failureCode })
    .where(eq(schema.localisationAudits.id, auditId));
}
