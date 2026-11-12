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
import { LOCALISATION_AUDIT_ANALYTICS_EVENTS, scoreBand } from "@/lib/analytics/events";
import { serverAnalytics } from "@/lib/analytics/server";
import {
  auditElapsedMs,
  auditStatusCounts,
  redactAuditErrorText,
} from "@/lib/localisation-audit/audit-log";
import {
  buildLocalisationAuditCompanyProfile,
  companyProfileFromAuditPayloads,
  isCompanyProfileIncomplete,
  mergeCompanyProfiles,
} from "@/lib/localisation-audit/company-profile";
import { LOCALISATION_AUDIT_METHODOLOGY_VERSION } from "@/lib/localisation-audit/credits/catalog";
import { runLocalisationAuditCredits } from "@/lib/localisation-audit/credits/runner";
import { hasLocalisationAuditSuccessfulPage } from "@/lib/localisation-audit/report-coverage";
import {
  aggregateLocalisationAuditCredits,
  pickHeadlineFindings,
} from "@/lib/localisation-audit/score";
import { LOCALISATION_AUDIT_USER_AGENT_NAME } from "@/lib/localisation-audit/user-agent";
import {
  blockLocalisationAudit,
  completeLocalisationAudit,
  failLocalisationAudit,
  findLocalisationAuditById,
  listPendingLocalisationAuditLeads,
  markLocalisationAuditLeadEmailFailed,
  markLocalisationAuditLeadEmailQueued,
  markLocalisationAuditProgress,
  markLocalisationAuditRunning,
  patchLocalisationAuditCompanyProfile,
  upsertLocalisationAuditLeadForDelivery,
} from "@/lib/localisation-audit/store";
import type {
  LocalisationAuditCrawlResult,
  LocalisationAuditProgressStage,
  LocalisationAuditReport,
  LocalisationAuditTeaser,
} from "@/lib/localisation-audit/types";

// `@/lib/log` must load inside the step: a static import crashes the workflow sandbox.
async function stepLogger(bindings: Record<string, string | number>) {
  const { createLogger } = await import("@/lib/log");
  return createLogger("localisation-audit-step").child(bindings);
}

function auditLogger(input: { auditId: string; attemptNumber: number }) {
  return stepLogger({ auditId: input.auditId, attemptNumber: input.attemptNumber });
}

export async function prepareLocalisationAuditStep(input: {
  auditId: string;
  attemptNumber: number;
}) {
  "use step";

  const log = await auditLogger(input);
  const audit = await findLocalisationAuditById(input.auditId);
  if (!audit) {
    log.warn("localisation audit prepare: audit not found");
    return { ok: false as const, code: "audit_not_found" as const };
  }
  if (audit.attemptNumber !== input.attemptNumber) {
    log.info("localisation audit prepare: stale attempt", {
      currentAttemptNumber: audit.attemptNumber,
    });
    return {
      ok: true as const,
      alreadyCompleted: false as const,
      staleAttempt: true as const,
      auditId: audit.id,
      attemptNumber: audit.attemptNumber,
    };
  }
  if (audit.status === "succeeded" && audit.report) {
    log.info("localisation audit prepare: already completed");
    return {
      ok: true as const,
      alreadyCompleted: true as const,
      staleAttempt: false as const,
      auditId: audit.id,
      attemptNumber: audit.attemptNumber,
    };
  }

  const marked = await markLocalisationAuditRunning({
    auditId: input.auditId,
    attemptNumber: input.attemptNumber,
  });
  if (!marked) {
    log.info("localisation audit prepare: could not mark running", { status: audit.status });
    return {
      ok: true as const,
      alreadyCompleted: false as const,
      staleAttempt: true as const,
      auditId: audit.id,
      attemptNumber: audit.attemptNumber,
    };
  }

  log.info("localisation audit prepare: running", {
    previousStatus: audit.status,
    focusLocaleCount: audit.focusLocales?.length ?? 0,
  });
  return {
    ok: true as const,
    alreadyCompleted: false as const,
    staleAttempt: false as const,
    auditId: audit.id,
    attemptNumber: audit.attemptNumber,
    sourceUrl: audit.sourceUrl,
    domainKey: audit.domainKey,
    domainSlug: audit.domainSlug,
    focusLocales: audit.focusLocales ?? [],
    origin: new URL(audit.sourceUrl).origin,
  };
}

export async function setLocalisationAuditProgressStep(input: {
  auditId: string;
  attemptNumber: number;
  progressStage: LocalisationAuditProgressStage;
}) {
  "use step";
  await markLocalisationAuditProgress(input);
  (await auditLogger(input)).info("localisation audit progress", {
    progressStage: input.progressStage,
  });
  return { ok: true as const };
}

export async function crawlLocalisationAuditStep(input: {
  origin: string;
  sourceUrl: string;
  focusLocales?: string[];
  auditId?: string;
  attemptNumber?: number;
}): Promise<LocalisationAuditCrawlResult> {
  "use step";
  const { crawlLocalisationAuditSample } = await import("@/lib/localisation-audit/crawl");
  const logBindings: Record<string, string | number> = {};
  if (input.auditId) logBindings.auditId = input.auditId;
  if (input.attemptNumber != null) logBindings.attemptNumber = input.attemptNumber;
  return crawlLocalisationAuditSample(
    { origin: input.origin, sourceUrl: input.sourceUrl, focusLocales: input.focusLocales },
    { logBindings },
  );
}

export async function analyzeLocalisationAuditStep(input: {
  auditId: string;
  attemptNumber: number;
  domainKey: string;
  domainSlug: string;
  sourceUrl: string;
  focusLocales: string[];
  pages: LocalisationAuditCrawlResult["pages"];
  sitemap: LocalisationAuditCrawlResult["sitemap"];
  blockedReason?: LocalisationAuditCrawlResult["blockedReason"];
}) {
  "use step";

  const log = await auditLogger(input);
  const startedAt = performance.now();
  if (input.blockedReason) {
    log.warn("localisation audit analyze: blocked", { blockedReason: input.blockedReason });
    const blocked = await blockLocalisationAudit({
      auditId: input.auditId,
      attemptNumber: input.attemptNumber,
      errorCode: "crawl_blocked",
      errorMessage: `This domain blocked ${LOCALISATION_AUDIT_USER_AGENT_NAME}. Allow it through your firewall, CDN, bot protection, or login wall, then start a new audit.`,
    });
    if (!blocked) {
      log.info("localisation audit analyze: stale attempt while blocking");
      return { ok: false as const, code: "stale_attempt" as const };
    }
    serverAnalytics.track(LOCALISATION_AUDIT_ANALYTICS_EVENTS.blocked, {
      status: "blocked",
      outcome: input.blockedReason,
    });
    return { ok: false as const, code: "localisation_audit_blocked" as const };
  }

  if (!hasLocalisationAuditSuccessfulPage(input.pages)) {
    log.warn("localisation audit analyze: no successful page", {
      pageCount: input.pages.length,
      statusCounts: auditStatusCounts(input.pages),
    });
    await failLocalisationAudit({
      auditId: input.auditId,
      attemptNumber: input.attemptNumber,
      errorCode: "crawl_failed",
      errorMessage:
        input.pages.length === 0
          ? "No pages could be crawled for this domain."
          : "None of the sampled pages loaded successfully, so we could not score this domain.",
    });
    serverAnalytics.track(LOCALISATION_AUDIT_ANALYTICS_EVENTS.failed, {
      status: "failed",
      outcome: "crawl_failed",
    });
    return { ok: false as const, code: "crawl_failed" as const };
  }

  const audit = await findLocalisationAuditById(input.auditId);
  const existingProfile = companyProfileFromAuditPayloads({
    teaser: audit?.teaser,
    report: audit?.report,
  });
  const inferredProfile = await buildLocalisationAuditCompanyProfile({
    domainKey: input.domainKey,
    pages: input.pages,
  });
  const companyProfile = mergeCompanyProfiles(existingProfile, inferredProfile);

  // Persist cover fields before scoring so a failed re-run still updates
  // legacy rows that never stored a logo or product summary.
  if (isCompanyProfileIncomplete(existingProfile)) {
    await patchLocalisationAuditCompanyProfile({
      auditId: input.auditId,
      attemptNumber: input.attemptNumber,
      companyProfile,
    });
  }

  await markLocalisationAuditProgress({
    auditId: input.auditId,
    attemptNumber: input.attemptNumber,
    progressStage: "scoring",
  });

  const scored = await runLocalisationAuditCredits({
    pages: input.pages,
    focusLocales: input.focusLocales,
    sitemap: input.sitemap,
  });
  const { score, dimensionScores, localeCoverageFactor } = aggregateLocalisationAuditCredits(
    scored.credits,
    { localeCount: scored.detectedLocales.length },
  );
  log.info("localisation audit analyze: scored", {
    score,
    pageCount: input.pages.length,
    statusCounts: auditStatusCounts(input.pages),
    detectedLocaleCount: scored.detectedLocales.length,
    findingsCount: scored.findings.length,
    creditCount: scored.credits.length,
    durationMs: auditElapsedMs(startedAt),
  });
  const completedAt = new Date().toISOString();

  const report: LocalisationAuditReport = {
    score,
    domainKey: input.domainKey,
    domainSlug: input.domainSlug,
    sourceUrl: input.sourceUrl,
    focusLocales: input.focusLocales,
    detectedLocales: scored.detectedLocales,
    findings: scored.findings,
    pages: input.pages.map((page) => ({
      url: page.url,
      status: page.status,
      htmlLang: page.htmlLang,
      title: page.title,
    })),
    linguisticNotes: scored.linguisticNotes,
    pagesCrawled: input.pages.length,
    completedAt,
    dimensionScores,
    credits: scored.credits,
    companyProfile,
    methodologyVersion: LOCALISATION_AUDIT_METHODOLOGY_VERSION,
    localeCoverageFactor,
  };

  const teaser: LocalisationAuditTeaser = {
    score,
    domainKey: input.domainKey,
    domainSlug: input.domainSlug,
    detectedLocales: scored.detectedLocales,
    headlineFindings: pickHeadlineFindings(scored.findings, 3, scored.credits),
    findingsCount: scored.findings.length,
    pagesCrawled: input.pages.length,
    completedAt,
    dimensionScores,
    credits: scored.credits,
    companyProfile,
    methodologyVersion: LOCALISATION_AUDIT_METHODOLOGY_VERSION,
    localeCoverageFactor,
  };

  const completed = await completeLocalisationAudit({
    auditId: input.auditId,
    attemptNumber: input.attemptNumber,
    score,
    teaser,
    report,
  });

  if (!completed) {
    log.info("localisation audit analyze: stale attempt while completing");
    return { ok: false as const, code: "stale_attempt" as const };
  }
  log.info("localisation audit completed", { score });

  serverAnalytics.track(LOCALISATION_AUDIT_ANALYTICS_EVENTS.completed, {
    status: "succeeded",
    score_band: scoreBand(score),
  });

  return { ok: true as const, score, teaser };
}

export async function failLocalisationAuditStep(input: {
  auditId: string;
  attemptNumber: number;
  errorCode: string;
  errorMessage: string;
}) {
  "use step";
  (await auditLogger(input)).error("localisation audit failed", {
    errorCode: input.errorCode,
    errorMessage: redactAuditErrorText(input.errorMessage),
  });
  await failLocalisationAudit(input);
  serverAnalytics.track(LOCALISATION_AUDIT_ANALYTICS_EVENTS.failed, {
    status: "failed",
    outcome: input.errorCode,
  });
  return { ok: false as const, ...input };
}

export async function queuePendingLocalisationAuditReportEmailsStep(auditId: string) {
  "use step";

  const log = await stepLogger({ auditId });
  const pending = await listPendingLocalisationAuditLeads(auditId);
  if (pending.length === 0) {
    log.info("localisation audit report emails: none pending");
    return { queued: 0 };
  }

  const { createLocalisationAuditReportEmailQueue } = await import("@/workflows/adapters");
  const queue = createLocalisationAuditReportEmailQueue();
  let queued = 0;
  let enqueueFailures = 0;
  for (const lead of pending) {
    const refreshed = await upsertLocalisationAuditLeadForDelivery({
      auditId: lead.auditId,
      email: lead.email,
      locale: lead.locale,
      forceResend: true,
    });
    await markLocalisationAuditLeadEmailQueued(refreshed.lead.id);
    try {
      await queue.enqueue({ leadId: refreshed.lead.id, token: refreshed.token });
      queued += 1;
    } catch {
      // Keep the lead selectable by listPendingLocalisationAuditLeads (pending|failed).
      await markLocalisationAuditLeadEmailFailed({
        leadId: refreshed.lead.id,
        error: "localisation_audit_email_enqueue_failed",
      });
      enqueueFailures += 1;
    }
  }

  log.info("localisation audit report emails queued", {
    pendingCount: pending.length,
    queuedCount: queued,
    failedCount: enqueueFailures,
  });
  if (enqueueFailures > 0) {
    // Throw so the step retries; recently queued leads stay within the resend
    // cooldown and are skipped on the next listPending pass.
    throw new Error(
      `localisation_audit_email_enqueue_failed:${enqueueFailures}_of_${pending.length}`,
    );
  }

  return { queued };
}
