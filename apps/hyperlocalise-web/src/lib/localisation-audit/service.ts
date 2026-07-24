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

import { and, count, eq, gte } from "drizzle-orm";
import { nanoid } from "nanoid";
import { Resend } from "resend";

import { db, schema, type DatabaseClient } from "@/lib/database";
import type {
  LocalisationAuditPageExtractionData,
  LocalisationAuditReportData,
} from "@/lib/database/schema/localisation-audit";
import { env } from "@/lib/env";
import { mapWithConcurrency } from "@/lib/primitives/map-with-concurrency/map-with-concurrency";
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";

import { mintPrivateReportAccessToken } from "./access-token";
import { fetchAuditPage } from "./fetch-page";
import { evaluateLocalisationAudit } from "./findings";
import { discoverLocaleAlternatives, normalizeAuditUrl, sanitizeAuditExcerpt } from "./parser";
import { createReportProjections } from "./report";
import {
  loadPrivateLocalisationAuditReportByToken,
  loadPublicLocalisationAuditReportBySlug,
} from "./report-loaders";
import { calculateLocalisationAuditScores } from "./scoring";
import type {
  AuditedPage,
  ConfirmAuditInput,
  ExtractedPage,
  LocalisationAuditError,
  PrepareAuditInput,
  PrivateAuditReport,
  PublicAuditReport,
  SafeAudit,
  UnlockAuditInput,
} from "./types";
import { LOCALISATION_AUDIT_REPORT_VERSION, LOCALISATION_AUDIT_SCORE_VERSION } from "./types";

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const IP_RATE_LIMIT = 10;
const DOMAIN_RATE_LIMIT = 5;
const MAX_PERSISTED_VISIBLE_TEXT = 2_000;

type AuditRecord = typeof schema.localisationAudits.$inferSelect;

export type LocalisationAuditService = {
  prepareAudit(input: PrepareAuditInput): Promise<Result<SafeAudit, LocalisationAuditError>>;
  getAudit(auditId: string): Promise<Result<SafeAudit, LocalisationAuditError>>;
  confirmAudit(input: ConfirmAuditInput): Promise<Result<SafeAudit, LocalisationAuditError>>;
  unlockAudit(
    input: UnlockAuditInput,
  ): Promise<Result<{ accessUrl: string }, LocalisationAuditError>>;
  getPublicReport(slug: string): Promise<Result<PublicAuditReport, LocalisationAuditError>>;
};

function hashBudgetKey(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("hex");
}

function toPersistedExtraction(extracted: ExtractedPage): LocalisationAuditPageExtractionData {
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

function fromPersistedExtraction(
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

function safeAuditFromRecord(
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

async function findReportForAudit(
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

async function getAuditRecord(
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

async function checkRateLimit(ipHash: string, domainHash: string): Promise<boolean> {
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
  const [ipCountRows, domainCountRows] = await Promise.all([
    db
      .select({ value: count() })
      .from(schema.localisationAudits)
      .where(
        and(
          eq(schema.localisationAudits.ipHash, ipHash),
          gte(schema.localisationAudits.createdAt, windowStart),
        ),
      ),
    db
      .select({ value: count() })
      .from(schema.localisationAudits)
      .where(
        and(
          eq(schema.localisationAudits.domainHash, domainHash),
          gte(schema.localisationAudits.createdAt, windowStart),
        ),
      ),
  ]);
  return (
    Number(ipCountRows[0]?.value ?? 0) < IP_RATE_LIMIT &&
    Number(domainCountRows[0]?.value ?? 0) < DOMAIN_RATE_LIMIT
  );
}

async function sendReportEmailBestEffort(input: {
  email: string;
  accessUrl: string;
}): Promise<"sent" | "skipped" | "failed"> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromAddress = process.env.RESEND_FROM_ADDRESS;
  if (!apiKey || !fromAddress) {
    return "skipped";
  }

  try {
    const resend = new Resend(apiKey);
    const response = await resend.emails.send({
      from: `${env.RESEND_FROM_NAME ?? "Hyperlocalise"} <${fromAddress}>`,
      to: input.email,
      subject: "Your localisation health audit",
      text: `Your private localisation audit is ready: ${input.accessUrl}`,
    });
    return response.error ? "failed" : "sent";
  } catch {
    return "failed";
  }
}

async function prepareAudit(
  input: PrepareAuditInput,
): Promise<Result<SafeAudit, LocalisationAuditError>> {
  const secret = env.LOCALISATION_AUDIT_ACCESS_SECRET;
  if (!secret) {
    return err({
      code: "audit_access_not_configured",
      message: "The localisation audit is not configured.",
    });
  }
  const normalizedUrl = normalizeAuditUrl(input.url);
  if (!normalizedUrl) {
    return err({ code: "invalid_audit_url", message: "Enter a valid HTTP(S) URL." });
  }
  const url = new URL(normalizedUrl);
  const domain = url.hostname.toLowerCase();
  const domainHash = hashBudgetKey(domain, secret);
  const ipHash = hashBudgetKey(input.ipAddress, secret);
  if (!(await checkRateLimit(ipHash, domainHash))) {
    return err({
      code: "audit_rate_limited",
      message: "The audit submission limit has been reached. Try again later.",
    });
  }

  const pageResult = await fetchAuditPage(normalizedUrl, { isPrimary: true });
  if (isErr(pageResult)) {
    return pageResult;
  }
  if (pageResult.value.status !== "extracted") {
    return err({
      code: "audit_fetch_failed",
      message: "The submitted page could not be extracted.",
    });
  }

  const page = pageResult.value;
  const alternatives = discoverLocaleAlternatives(page.extracted);
  const audit = await db.transaction(async (tx) => {
    const [createdAudit] = await tx
      .insert(schema.localisationAudits)
      .values({
        status: "awaiting_confirmation",
        submittedUrl: normalizedUrl,
        normalizedUrl,
        domain,
        domainHash,
        ipHash,
        detectedLocale: page.extracted.htmlLang,
        alternatives,
        scoreVersion: LOCALISATION_AUDIT_SCORE_VERSION,
        reportVersion: LOCALISATION_AUDIT_REPORT_VERSION,
      })
      .returning();
    if (!createdAudit) {
      throw new Error("Failed to persist localisation audit.");
    }
    await tx.insert(schema.localisationAuditPages).values({
      auditId: createdAudit.id,
      normalizedUrl: page.url,
      locale: page.extracted.htmlLang,
      isPrimary: true,
      status: "extracted",
      httpStatus: page.httpStatus,
      contentFingerprint: page.extracted.contentFingerprint,
      extraction: toPersistedExtraction(page.extracted),
      fetchedAt: new Date(),
    });
    await tx.insert(schema.localisationAuditEvents).values([
      { auditId: createdAudit.id, eventType: "submitted", metadata: { source: "api" } },
      {
        auditId: createdAudit.id,
        eventType: "prepared",
        metadata: { localeCount: alternatives.length + 1 },
      },
    ]);
    return createdAudit;
  });

  return ok(safeAuditFromRecord(audit));
}

async function getAudit(auditId: string): Promise<Result<SafeAudit, LocalisationAuditError>> {
  const audit = await getAuditRecord(db, auditId);
  if (!audit) {
    return err({ code: "audit_not_found", message: "The audit was not found." });
  }
  const report =
    audit.status === "completed" || audit.status === "partial"
      ? await findReportForAudit(db, audit.id)
      : null;
  return ok(safeAuditFromRecord(audit, report));
}

async function confirmAudit(
  input: ConfirmAuditInput,
): Promise<Result<SafeAudit, LocalisationAuditError>> {
  const audit = await getAuditRecord(db, input.auditId);
  if (!audit) {
    return err({ code: "audit_not_found", message: "The audit was not found." });
  }
  if (audit.status !== "awaiting_confirmation") {
    return err({
      code: "audit_not_awaiting_confirmation",
      message: "The audit cannot be confirmed in its current state.",
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
    return err({
      code: "audit_fetch_failed",
      message: "The submitted page extraction is unavailable.",
    });
  }

  await db
    .update(schema.localisationAudits)
    .set({
      status: "running",
      targetLocale: input.targetLocale,
      targetMarket: input.targetMarket.toUpperCase(),
      confirmedAt: new Date(),
    })
    .where(eq(schema.localisationAudits.id, audit.id));

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
  const alternativePages = await mapWithConcurrency(audit.alternatives, 3, async (alternative) => {
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
          result.error.code === "audit_url_not_public" ? ("blocked" as const) : ("failed" as const),
        failureCode: result.error.code,
      };
    }
    return result.value;
  });
  const pages = [primaryPage, ...alternativePages];
  const evaluation = evaluateLocalisationAudit({
    pages,
    targetLocale: input.targetLocale,
    targetMarket: input.targetMarket,
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
    await tx.insert(schema.localisationAuditEvents).values([
      { auditId: audit.id, eventType: "confirmed", metadata: { source: "api" } },
      {
        auditId: audit.id,
        eventType: "completed",
        metadata: {
          findingCount: evaluation.findings.length,
          localeCount: pages.length,
        },
      },
    ]);
    return safeAuditFromRecord(updatedAudit, report);
  });

  return ok(completed);
}

async function unlockAudit(
  input: UnlockAuditInput,
): Promise<Result<{ accessUrl: string }, LocalisationAuditError>> {
  const secret = env.LOCALISATION_AUDIT_ACCESS_SECRET;
  if (!secret) {
    return err({
      code: "audit_access_not_configured",
      message: "Private report access is not configured.",
    });
  }
  const audit = await getAuditRecord(db, input.auditId);
  if (!audit) {
    return err({ code: "audit_not_found", message: "The audit was not found." });
  }
  if (audit.status !== "completed" && audit.status !== "partial") {
    return err({
      code: "audit_not_complete",
      message: "The audit report is not ready to unlock.",
    });
  }
  const report = await findReportForAudit(db, audit.id);
  if (!report) {
    return err({ code: "report_not_found", message: "The report was not found." });
  }

  const token = mintPrivateReportAccessToken({
    auditId: audit.id,
    reportId: report.id,
    secret,
  });
  const accessUrl = `${input.origin.replace(/\/+$/, "")}/en/localisation-audit/report/${encodeURIComponent(token)}`;
  const [lead] = await db
    .insert(schema.localisationAuditLeads)
    .values({
      auditId: audit.id,
      email: input.email,
      name: input.name,
    })
    .returning({ id: schema.localisationAuditLeads.id });
  if (!lead) {
    throw new Error("Failed to persist localisation audit lead.");
  }
  await db.insert(schema.localisationAuditEvents).values({
    auditId: audit.id,
    leadId: lead.id,
    eventType: "unlocked",
    metadata: { source: "api" },
  });

  const deliveryStatus = await sendReportEmailBestEffort({
    email: input.email,
    accessUrl,
  });
  await db
    .update(schema.localisationAuditLeads)
    .set({ emailDeliveryStatus: deliveryStatus })
    .where(eq(schema.localisationAuditLeads.id, lead.id));
  if (deliveryStatus === "failed") {
    await db.insert(schema.localisationAuditEvents).values({
      auditId: audit.id,
      leadId: lead.id,
      eventType: "email_delivery_failed",
      metadata: { deliveryStatus },
    });
    return err({
      code: "audit_email_delivery_failed",
      message: "The report email could not be delivered. Try again.",
    });
  }

  return ok({ accessUrl });
}

async function getPublicReport(
  slug: string,
): Promise<Result<PublicAuditReport, LocalisationAuditError>> {
  const [report] = await db
    .select({ publicReport: schema.localisationAuditReports.publicReport })
    .from(schema.localisationAuditReports)
    .where(
      and(
        eq(schema.localisationAuditReports.publicSlug, slug),
        eq(schema.localisationAuditReports.visibility, "public"),
      ),
    )
    .limit(1);
  if (!report) {
    return err({ code: "report_not_found", message: "The report was not found." });
  }
  return ok(report.publicReport);
}

export const localisationAuditService: LocalisationAuditService = {
  prepareAudit,
  getAudit,
  confirmAudit,
  unlockAudit,
  getPublicReport,
};

export async function getPublicAuditReportBySlug(slug: string): Promise<PublicAuditReport | null> {
  return loadPublicLocalisationAuditReportBySlug(slug);
}

export async function getPrivateAuditReportByToken(
  token: string,
): Promise<PrivateAuditReport | null> {
  const result = await loadPrivateLocalisationAuditReportByToken(token);
  return isErr(result) ? null : result.value;
}
