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
import { LOCALISATION_AUDIT_ANALYTICS_EVENTS, scoreBand } from "@/lib/analytics";
import { serverAnalytics } from "@/lib/analytics/server";
import { crawlLocalisationAuditSample } from "@/lib/localisation-audit/crawl";
import { runLinguisticLocalisationReview } from "@/lib/localisation-audit/linguistic-review";
import { pickHeadlineFindings, scoreLocalisationAudit } from "@/lib/localisation-audit/score";
import {
  completeLocalisationAudit,
  failLocalisationAudit,
  findLocalisationAuditById,
  listPendingLocalisationAuditLeads,
  markLocalisationAuditLeadEmailQueued,
  markLocalisationAuditProgress,
  markLocalisationAuditRunning,
} from "@/lib/localisation-audit/store";
import { runTechnicalLocalisationChecks } from "@/lib/localisation-audit/technical-checks";
import type {
  LocalisationAuditCrawledPage,
  LocalisationAuditProgressStage,
  LocalisationAuditReport,
  LocalisationAuditTeaser,
} from "@/lib/localisation-audit/types";
export async function prepareLocalisationAuditStep(input: {
  auditId: string;
  attemptNumber: number;
}) {
  "use step";

  const audit = await findLocalisationAuditById(input.auditId);
  if (!audit) {
    return { ok: false as const, code: "audit_not_found" as const };
  }
  if (audit.attemptNumber !== input.attemptNumber) {
    return {
      ok: true as const,
      alreadyCompleted: false as const,
      staleAttempt: true as const,
      auditId: audit.id,
      attemptNumber: audit.attemptNumber,
    };
  }
  if (audit.status === "succeeded" && audit.report) {
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
    return {
      ok: true as const,
      alreadyCompleted: false as const,
      staleAttempt: true as const,
      auditId: audit.id,
      attemptNumber: audit.attemptNumber,
    };
  }

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
  return { ok: true as const };
}

export async function crawlLocalisationAuditStep(input: {
  origin: string;
  sourceUrl: string;
}): Promise<LocalisationAuditCrawledPage[]> {
  "use step";
  return crawlLocalisationAuditSample(input);
}

export async function analyzeLocalisationAuditStep(input: {
  auditId: string;
  attemptNumber: number;
  domainKey: string;
  domainSlug: string;
  sourceUrl: string;
  focusLocales: string[];
  pages: LocalisationAuditCrawledPage[];
}) {
  "use step";

  if (input.pages.length === 0) {
    await failLocalisationAudit({
      auditId: input.auditId,
      attemptNumber: input.attemptNumber,
      errorCode: "crawl_failed",
      errorMessage: "No pages could be crawled for this domain.",
    });
    serverAnalytics.track(LOCALISATION_AUDIT_ANALYTICS_EVENTS.failed, {
      status: "failed",
      outcome: "crawl_failed",
    });
    return { ok: false as const, code: "crawl_failed" as const };
  }

  await markLocalisationAuditProgress({
    auditId: input.auditId,
    attemptNumber: input.attemptNumber,
    progressStage: "scoring",
  });

  const technical = runTechnicalLocalisationChecks({
    pages: input.pages,
    focusLocales: input.focusLocales,
  });
  const linguistic = await runLinguisticLocalisationReview({
    pages: input.pages,
    focusLocales: input.focusLocales,
  });

  const findings = [...technical.findings, ...linguistic.findings];
  const score = scoreLocalisationAudit(findings);
  const completedAt = new Date().toISOString();

  const report: LocalisationAuditReport = {
    score,
    domainKey: input.domainKey,
    domainSlug: input.domainSlug,
    sourceUrl: input.sourceUrl,
    focusLocales: input.focusLocales,
    detectedLocales: technical.detectedLocales,
    findings,
    pages: input.pages.map((page) => ({
      url: page.url,
      status: page.status,
      htmlLang: page.htmlLang,
      title: page.title,
    })),
    linguisticNotes: linguistic.linguisticNotes,
    pagesCrawled: input.pages.length,
    completedAt,
  };

  const teaser: LocalisationAuditTeaser = {
    score,
    domainKey: input.domainKey,
    domainSlug: input.domainSlug,
    detectedLocales: technical.detectedLocales,
    headlineFindings: pickHeadlineFindings(findings, 3),
    pagesCrawled: input.pages.length,
    completedAt,
  };

  const completed = await completeLocalisationAudit({
    auditId: input.auditId,
    attemptNumber: input.attemptNumber,
    score,
    teaser,
    report,
  });

  if (!completed) {
    return { ok: false as const, code: "stale_attempt" as const };
  }

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
  await failLocalisationAudit(input);
  serverAnalytics.track(LOCALISATION_AUDIT_ANALYTICS_EVENTS.failed, {
    status: "failed",
    outcome: input.errorCode,
  });
  return { ok: false as const, ...input };
}

export async function queuePendingLocalisationAuditReportEmailsStep(auditId: string) {
  "use step";

  const pending = await listPendingLocalisationAuditLeads(auditId);
  if (pending.length === 0) {
    return { queued: 0 };
  }

  const { createLocalisationAuditReportEmailQueue } = await import("@/workflows/adapters");
  const queue = createLocalisationAuditReportEmailQueue();
  let queued = 0;
  for (const lead of pending) {
    await markLocalisationAuditLeadEmailQueued(lead.id);
    // Send step mints a fresh token when none is provided.
    await queue.enqueue({ leadId: lead.id });
    queued += 1;
  }
  return { queued };
}
