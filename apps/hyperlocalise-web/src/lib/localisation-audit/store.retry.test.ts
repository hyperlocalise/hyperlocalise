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
import { and, eq, gte, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import { db, schema } from "@/lib/database";

import {
  LocalisationAuditDailyQuotaExceededError,
  setLocalisationAuditDailyRunLimitForTests,
} from "./daily-quota";
import { hostnameToDomainSlug } from "./domain-slug";
import {
  claimOrReuseLocalisationAudit,
  completeLocalisationAudit,
  failLocalisationAudit,
  getLocalisationAuditStanding,
  isLocalisationAuditRerunnable,
  isLocalisationAuditRetryable,
  listLocalisationAuditLeaderboard,
  listPendingLocalisationAuditLeads,
  markLocalisationAuditLeadEmailQueued,
  patchLocalisationAuditCompanyProfile,
  upsertLocalisationAuditLeadForDelivery,
  verifyLocalisationAuditReportToken,
} from "./store";
import {
  LOCALISATION_AUDIT_DAILY_RUN_LIMIT,
  LOCALISATION_AUDIT_EMAIL_RESEND_COOLDOWN_MS,
  LOCALISATION_AUDIT_RERUN_MS,
  LOCALISATION_AUDIT_STALE_MS,
} from "./types";

async function cleanup(domainKey: string) {
  await db
    .delete(schema.localisationAudits)
    .where(eq(schema.localisationAudits.domainKey, domainKey));
}

describe("localisation audit claim/retry", () => {
  const domainKey = `retry-${Date.now()}.example`;
  const domainSlug = `retry-${Date.now()}-example`;

  beforeEach(() => {
    setLocalisationAuditDailyRunLimitForTests(10_000);
  });

  afterEach(async () => {
    setLocalisationAuditDailyRunLimitForTests(LOCALISATION_AUDIT_DAILY_RUN_LIMIT);
    await cleanup(domainKey);
  });

  it("reuses successful audits and reclaim failed or stale ones", async () => {
    const created = await claimOrReuseLocalisationAudit({
      domainKey,
      domainSlug,
      sourceUrl: `https://${domainKey}/`,
      focusLocales: ["fr"],
    });
    expect(created.outcome).toBe("created");
    expect(created.audit.attemptNumber).toBe(1);

    const active = await claimOrReuseLocalisationAudit({
      domainKey,
      domainSlug,
      sourceUrl: `https://${domainKey}/`,
      focusLocales: [],
    });
    expect(active.outcome).toBe("reused_active");

    await failLocalisationAudit({
      auditId: created.audit.id,
      attemptNumber: 1,
      errorCode: "crawl_failed",
      errorMessage: "no pages",
    });

    const [failedRow] = await db
      .select()
      .from(schema.localisationAudits)
      .where(eq(schema.localisationAudits.id, created.audit.id))
      .limit(1);
    expect(failedRow).toBeTruthy();
    expect(isLocalisationAuditRetryable(failedRow!)).toBe(true);

    const reclaimed = await claimOrReuseLocalisationAudit({
      domainKey,
      domainSlug,
      sourceUrl: `https://${domainKey}/pricing`,
      focusLocales: ["de"],
    });
    expect(reclaimed.outcome).toBe("reclaimed");
    expect(reclaimed.audit.attemptNumber).toBe(2);
    expect(reclaimed.audit.status).toBe("queued");
    expect(reclaimed.audit.focusLocales).toEqual(["de"]);

    // Old attempt must not overwrite a newer run.
    const oldWrite = await completeLocalisationAudit({
      auditId: created.audit.id,
      attemptNumber: 1,
      score: 10,
      teaser: {
        score: 10,
        domainKey,
        domainSlug,
        detectedLocales: [],
        headlineFindings: [],
        findingsCount: 0,
        pagesCrawled: 1,
        completedAt: new Date().toISOString(),
      },
      report: {
        score: 10,
        domainKey,
        domainSlug,
        sourceUrl: `https://${domainKey}/`,
        focusLocales: [],
        detectedLocales: [],
        findings: [],
        pages: [],
        linguisticNotes: [],
        pagesCrawled: 1,
        completedAt: new Date().toISOString(),
      },
    });
    expect(oldWrite).toBeNull();

    await db
      .update(schema.localisationAudits)
      .set({
        status: "running",
        statusUpdatedAt: new Date(Date.now() - LOCALISATION_AUDIT_STALE_MS - 1_000),
      })
      .where(eq(schema.localisationAudits.id, created.audit.id));

    const staleReclaim = await claimOrReuseLocalisationAudit({
      domainKey,
      domainSlug,
      sourceUrl: `https://${domainKey}/`,
      focusLocales: [],
    });
    expect(staleReclaim.outcome).toBe("reclaimed");
    expect(staleReclaim.audit.attemptNumber).toBe(3);

    await db
      .update(schema.localisationAudits)
      .set({
        status: "succeeded",
        report: null,
      })
      .where(eq(schema.localisationAudits.id, created.audit.id));

    const incompleteSuccessReclaim = await claimOrReuseLocalisationAudit({
      domainKey,
      domainSlug,
      sourceUrl: `https://${domainKey}/`,
      focusLocales: [],
    });
    expect(incompleteSuccessReclaim.outcome).toBe("reclaimed");
    expect(incompleteSuccessReclaim.audit.attemptNumber).toBe(4);
  });

  it("reuses a successful audit until the daily re-run window, then reclaims it", async () => {
    const created = await claimOrReuseLocalisationAudit({
      domainKey,
      domainSlug,
      sourceUrl: `https://${domainKey}/`,
      focusLocales: [],
    });

    await completeLocalisationAudit({
      auditId: created.audit.id,
      attemptNumber: 1,
      score: 72,
      teaser: {
        score: 72,
        domainKey,
        domainSlug,
        detectedLocales: [],
        headlineFindings: [],
        findingsCount: 0,
        pagesCrawled: 1,
        completedAt: new Date().toISOString(),
      },
      report: {
        score: 72,
        domainKey,
        domainSlug,
        sourceUrl: `https://${domainKey}/`,
        focusLocales: [],
        detectedLocales: [],
        findings: [],
        pages: [],
        linguisticNotes: [],
        pagesCrawled: 1,
        completedAt: new Date().toISOString(),
      },
    });

    const [fresh] = await db
      .select()
      .from(schema.localisationAudits)
      .where(eq(schema.localisationAudits.id, created.audit.id))
      .limit(1);
    expect(isLocalisationAuditRetryable(fresh!)).toBe(false);
    expect(isLocalisationAuditRerunnable(fresh!)).toBe(false);

    const reused = await claimOrReuseLocalisationAudit({
      domainKey,
      domainSlug,
      sourceUrl: `https://${domainKey}/`,
      focusLocales: [],
    });
    expect(reused.outcome).toBe("reused_success");
    expect(reused.audit.attemptNumber).toBe(1);

    await db
      .update(schema.localisationAudits)
      .set({
        completedAt: new Date(Date.now() - LOCALISATION_AUDIT_RERUN_MS - 1_000),
      })
      .where(eq(schema.localisationAudits.id, created.audit.id));

    const [aged] = await db
      .select()
      .from(schema.localisationAudits)
      .where(eq(schema.localisationAudits.id, created.audit.id))
      .limit(1);
    expect(isLocalisationAuditRetryable(aged!)).toBe(false);
    expect(isLocalisationAuditRerunnable(aged!)).toBe(true);

    const reclaimed = await claimOrReuseLocalisationAudit({
      domainKey,
      domainSlug,
      sourceUrl: `https://${domainKey}/pricing`,
      focusLocales: ["fr"],
    });
    expect(reclaimed.outcome).toBe("reclaimed");
    expect(reclaimed.audit.attemptNumber).toBe(2);
    expect(reclaimed.audit.status).toBe("queued");
    expect(reclaimed.audit.focusLocales).toEqual(["fr"]);
    expect(reclaimed.audit.report?.score).toBe(72);
    expect(reclaimed.audit.score).toBe(72);
    expect(reclaimed.audit.teaser?.score).toBe(72);
    expect(reclaimed.audit.completedAt?.getTime()).toBe(aged!.completedAt!.getTime());

    const restored = await failLocalisationAudit({
      auditId: reclaimed.audit.id,
      attemptNumber: 2,
      errorCode: "crawl_failed",
      errorMessage: "No pages could be crawled for this domain.",
    });
    expect(restored?.status).toBe("succeeded");
    expect(restored?.progressStage).toBe("completed");
    expect(restored?.report?.score).toBe(72);
    expect(restored?.score).toBe(72);
    expect(restored?.errorCode).toBeNull();
    expect(restored?.completedAt?.getTime()).toBe(aged!.completedAt!.getTime());
  });

  it("preserves a prior report across stale reclaim of a daily re-run", async () => {
    const created = await claimOrReuseLocalisationAudit({
      domainKey,
      domainSlug,
      sourceUrl: `https://${domainKey}/`,
      focusLocales: [],
    });

    await completeLocalisationAudit({
      auditId: created.audit.id,
      attemptNumber: 1,
      score: 81,
      teaser: {
        score: 81,
        domainKey,
        domainSlug,
        detectedLocales: [],
        headlineFindings: [],
        findingsCount: 0,
        pagesCrawled: 1,
        completedAt: new Date().toISOString(),
      },
      report: {
        score: 81,
        domainKey,
        domainSlug,
        sourceUrl: `https://${domainKey}/`,
        focusLocales: [],
        detectedLocales: [],
        findings: [],
        pages: [],
        linguisticNotes: [],
        pagesCrawled: 1,
        completedAt: new Date().toISOString(),
      },
    });

    await db
      .update(schema.localisationAudits)
      .set({
        completedAt: new Date(Date.now() - LOCALISATION_AUDIT_RERUN_MS - 1_000),
      })
      .where(eq(schema.localisationAudits.id, created.audit.id));

    const [aged] = await db
      .select()
      .from(schema.localisationAudits)
      .where(eq(schema.localisationAudits.id, created.audit.id))
      .limit(1);

    const dailyRerun = await claimOrReuseLocalisationAudit({
      domainKey,
      domainSlug,
      sourceUrl: `https://${domainKey}/pricing`,
      focusLocales: ["de"],
    });
    expect(dailyRerun.outcome).toBe("reclaimed");
    expect(dailyRerun.audit.status).toBe("queued");
    expect(dailyRerun.audit.report?.score).toBe(81);
    expect(dailyRerun.audit.completedAt?.getTime()).toBe(aged!.completedAt!.getTime());

    await db
      .update(schema.localisationAudits)
      .set({
        status: "running",
        statusUpdatedAt: new Date(Date.now() - LOCALISATION_AUDIT_STALE_MS - 1_000),
      })
      .where(eq(schema.localisationAudits.id, created.audit.id));

    const staleReclaim = await claimOrReuseLocalisationAudit({
      domainKey,
      domainSlug,
      sourceUrl: `https://${domainKey}/`,
      focusLocales: [],
    });
    expect(staleReclaim.outcome).toBe("reclaimed");
    expect(staleReclaim.audit.attemptNumber).toBe(3);
    expect(staleReclaim.audit.status).toBe("queued");
    expect(staleReclaim.audit.report?.score).toBe(81);
    expect(staleReclaim.audit.score).toBe(81);
    expect(staleReclaim.audit.teaser?.score).toBe(81);
    expect(staleReclaim.audit.completedAt?.getTime()).toBe(aged!.completedAt!.getTime());

    const restored = await failLocalisationAudit({
      auditId: staleReclaim.audit.id,
      attemptNumber: 3,
      errorCode: "crawl_failed",
      errorMessage: "No pages could be crawled for this domain.",
    });
    expect(restored?.status).toBe("succeeded");
    expect(restored?.report?.score).toBe(81);
    expect(restored?.errorCode).toBeNull();
    expect(restored?.completedAt?.getTime()).toBe(aged!.completedAt!.getTime());
  });

  it("marks first-run failures as failed when no prior report exists", async () => {
    const created = await claimOrReuseLocalisationAudit({
      domainKey,
      domainSlug,
      sourceUrl: `https://${domainKey}/`,
      focusLocales: [],
    });

    const failed = await failLocalisationAudit({
      auditId: created.audit.id,
      attemptNumber: 1,
      errorCode: "localisation_audit_enqueue_failed",
      errorMessage: "Audit could not be queued. You can retry shortly.",
    });
    expect(failed?.status).toBe("failed");
    expect(failed?.progressStage).toBe("failed");
    expect(failed?.report).toBeNull();
    expect(failed?.errorCode).toBe("localisation_audit_enqueue_failed");
  });

  it("patches a missing company profile onto a preserved re-run report", async () => {
    const created = await claimOrReuseLocalisationAudit({
      domainKey,
      domainSlug,
      sourceUrl: `https://${domainKey}/`,
      focusLocales: [],
    });

    await completeLocalisationAudit({
      auditId: created.audit.id,
      attemptNumber: 1,
      score: 64,
      teaser: {
        score: 64,
        domainKey,
        domainSlug,
        detectedLocales: [],
        headlineFindings: [],
        findingsCount: 0,
        pagesCrawled: 1,
        completedAt: new Date().toISOString(),
      },
      report: {
        score: 64,
        domainKey,
        domainSlug,
        sourceUrl: `https://${domainKey}/`,
        focusLocales: [],
        detectedLocales: [],
        findings: [],
        pages: [],
        linguisticNotes: [],
        pagesCrawled: 1,
        completedAt: new Date().toISOString(),
      },
    });

    await db
      .update(schema.localisationAudits)
      .set({
        completedAt: new Date(Date.now() - LOCALISATION_AUDIT_RERUN_MS - 1_000),
      })
      .where(eq(schema.localisationAudits.id, created.audit.id));

    const rerun = await claimOrReuseLocalisationAudit({
      domainKey,
      domainSlug,
      sourceUrl: `https://${domainKey}/`,
      focusLocales: [],
    });
    expect(rerun.outcome).toBe("reclaimed");
    expect(rerun.audit.report?.companyProfile).toBeUndefined();

    const profile = {
      name: "Acme",
      logoUrl: "https://acme.example/logo.png",
      productSummary: "Payments for global teams.",
      brandVoice: "calm, precise",
      industry: "Fintech",
      confidence: 80,
    };
    const patched = await patchLocalisationAuditCompanyProfile({
      auditId: rerun.audit.id,
      attemptNumber: rerun.audit.attemptNumber,
      companyProfile: profile,
    });
    expect(patched?.teaser?.companyProfile).toEqual(profile);
    expect(patched?.report?.companyProfile).toEqual(profile);
    expect(patched?.status).toBe("queued");
    expect(patched?.score).toBe(64);

    const stale = await patchLocalisationAuditCompanyProfile({
      auditId: rerun.audit.id,
      attemptNumber: rerun.audit.attemptNumber - 1,
      companyProfile: { ...profile, name: "Stale" },
    });
    expect(stale).toBeNull();

    const restored = await failLocalisationAudit({
      auditId: rerun.audit.id,
      attemptNumber: rerun.audit.attemptNumber,
      errorCode: "localisation_audit_failed",
      errorMessage: "scoring failed",
    });
    expect(restored?.status).toBe("succeeded");
    expect(restored?.report?.companyProfile).toEqual(profile);
    expect(restored?.teaser?.companyProfile).toEqual(profile);
  });

  it("handles concurrent lead upserts idempotently", async () => {
    const created = await claimOrReuseLocalisationAudit({
      domainKey,
      domainSlug,
      sourceUrl: `https://${domainKey}/`,
      focusLocales: [],
    });

    const [first, second] = await Promise.all([
      upsertLocalisationAuditLeadForDelivery({
        auditId: created.audit.id,
        email: "lead@example.com",
        locale: "en",
      }),
      upsertLocalisationAuditLeadForDelivery({
        auditId: created.audit.id,
        email: "lead@example.com",
        locale: "en",
      }),
    ]);

    expect(first.lead.id).toBe(second.lead.id);
    const leads = await db
      .select()
      .from(schema.localisationAuditLeads)
      .where(
        and(
          eq(schema.localisationAuditLeads.auditId, created.audit.id),
          eq(schema.localisationAuditLeads.email, "lead@example.com"),
        ),
      );
    expect(leads).toHaveLength(1);
  });

  it("reselects queued leads after the resend cooldown", async () => {
    const created = await claimOrReuseLocalisationAudit({
      domainKey,
      domainSlug,
      sourceUrl: `https://${domainKey}/`,
      focusLocales: [],
    });
    const upsert = await upsertLocalisationAuditLeadForDelivery({
      auditId: created.audit.id,
      email: "lead@example.com",
      locale: "en",
    });
    await markLocalisationAuditLeadEmailQueued(upsert.lead.id);

    expect(await listPendingLocalisationAuditLeads(created.audit.id)).toHaveLength(0);

    await db
      .update(schema.localisationAuditLeads)
      .set({
        lastEmailQueuedAt: new Date(
          Date.now() - LOCALISATION_AUDIT_EMAIL_RESEND_COOLDOWN_MS - 1_000,
        ),
      })
      .where(eq(schema.localisationAuditLeads.id, upsert.lead.id));

    expect(await listPendingLocalisationAuditLeads(created.audit.id)).toHaveLength(1);
  });

  it("verifies report tokens idempotently until expiry", async () => {
    const created = await claimOrReuseLocalisationAudit({
      domainKey: `${domainKey}-email`,
      domainSlug: `${domainSlug}-email`,
      sourceUrl: `https://${domainKey}/`,
      focusLocales: [],
    });

    await completeLocalisationAudit({
      auditId: created.audit.id,
      attemptNumber: 1,
      score: 70,
      teaser: {
        score: 70,
        domainKey: created.audit.domainKey,
        domainSlug: created.audit.domainSlug,
        detectedLocales: [],
        headlineFindings: [],
        findingsCount: 0,
        pagesCrawled: 2,
        completedAt: new Date().toISOString(),
      },
      report: {
        score: 70,
        domainKey: created.audit.domainKey,
        domainSlug: created.audit.domainSlug,
        sourceUrl: created.audit.sourceUrl,
        focusLocales: [],
        detectedLocales: [],
        findings: [],
        pages: [],
        linguisticNotes: [],
        pagesCrawled: 2,
        completedAt: new Date().toISOString(),
      },
    });

    const upsert = await upsertLocalisationAuditLeadForDelivery({
      auditId: created.audit.id,
      email: "lead@example.com",
      locale: "en",
    });
    expect(upsert.token.length).toBeGreaterThan(10);

    const first = await verifyLocalisationAuditReportToken({
      domainSlug: created.audit.domainSlug,
      token: upsert.token,
    });
    expect(first?.lead.deliveryStatus).toBe("verified");
    expect(first?.lead.tokenHash).toBeTruthy();

    const second = await verifyLocalisationAuditReportToken({
      domainSlug: created.audit.domainSlug,
      token: upsert.token,
    });
    expect(second?.lead.deliveryStatus).toBe("verified");
    expect(second?.lead.email).toBe("lead@example.com");

    await db
      .delete(schema.localisationAudits)
      .where(and(eq(schema.localisationAudits.id, created.audit.id)));
  });
});

describe("localisation audit daily run quota", () => {
  const stamp = Date.now();
  const firstKey = `quota-a-${stamp}.example`;
  const secondKey = `quota-b-${stamp}.example`;

  afterEach(async () => {
    setLocalisationAuditDailyRunLimitForTests(LOCALISATION_AUDIT_DAILY_RUN_LIMIT);
    await cleanup(firstKey);
    await cleanup(secondKey);
  });

  it("caps new runs system-wide and still retries a same-day failure", async () => {
    const cutoff = new Date(Date.now() - LOCALISATION_AUDIT_RERUN_MS);
    const [usage] = await db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(schema.localisationAudits)
      .where(gte(schema.localisationAudits.lastAttemptAt, cutoff));
    const used = usage?.count ?? 0;
    setLocalisationAuditDailyRunLimitForTests(used + 1);

    const created = await claimOrReuseLocalisationAudit({
      domainKey: firstKey,
      domainSlug: hostnameToDomainSlug(firstKey),
      sourceUrl: `https://${firstKey}/`,
      focusLocales: [],
    });
    expect(created.outcome).toBe("created");

    await expect(
      claimOrReuseLocalisationAudit({
        domainKey: secondKey,
        domainSlug: hostnameToDomainSlug(secondKey),
        sourceUrl: `https://${secondKey}/`,
        focusLocales: [],
      }),
    ).rejects.toBeInstanceOf(LocalisationAuditDailyQuotaExceededError);

    await failLocalisationAudit({
      auditId: created.audit.id,
      attemptNumber: created.audit.attemptNumber,
      errorCode: "crawl_failed",
      errorMessage: "no pages",
    });

    const retried = await claimOrReuseLocalisationAudit({
      domainKey: firstKey,
      domainSlug: hostnameToDomainSlug(firstKey),
      sourceUrl: `https://${firstKey}/`,
      focusLocales: [],
    });
    expect(retried.outcome).toBe("reclaimed");
    expect(retried.audit.attemptNumber).toBe(created.audit.attemptNumber + 1);

    await expect(
      claimOrReuseLocalisationAudit({
        domainKey: secondKey,
        domainSlug: hostnameToDomainSlug(secondKey),
        sourceUrl: `https://${secondKey}/`,
        focusLocales: [],
      }),
    ).rejects.toBeInstanceOf(LocalisationAuditDailyQuotaExceededError);
  });
});

describe("localisation audit leaderboard", () => {
  const keys = [`lb-a-${Date.now()}.example`, `lb-b-${Date.now()}.example`];

  beforeEach(() => {
    setLocalisationAuditDailyRunLimitForTests(10_000);
  });

  afterEach(async () => {
    setLocalisationAuditDailyRunLimitForTests(LOCALISATION_AUDIT_DAILY_RUN_LIMIT);
    for (const domainKey of keys) {
      await cleanup(domainKey);
    }
  });

  it("ranks succeeded teasers and computes standing", async () => {
    const first = await claimOrReuseLocalisationAudit({
      domainKey: keys[0]!,
      domainSlug: `lb-a-${Date.now()}-example`,
      sourceUrl: `https://${keys[0]}/`,
      focusLocales: [],
    });
    const second = await claimOrReuseLocalisationAudit({
      domainKey: keys[1]!,
      domainSlug: `lb-b-${Date.now()}-example`,
      sourceUrl: `https://${keys[1]}/`,
      focusLocales: [],
    });

    await completeLocalisationAudit({
      auditId: first.audit.id,
      attemptNumber: 1,
      score: 91,
      teaser: {
        score: 91,
        domainKey: keys[0]!,
        domainSlug: first.audit.domainSlug,
        detectedLocales: [],
        headlineFindings: [],
        findingsCount: 2,
        pagesCrawled: 8,
        completedAt: new Date().toISOString(),
      },
      report: {
        score: 91,
        domainKey: keys[0]!,
        domainSlug: first.audit.domainSlug,
        sourceUrl: first.audit.sourceUrl,
        focusLocales: [],
        detectedLocales: [],
        findings: [],
        pages: [],
        linguisticNotes: [],
        pagesCrawled: 8,
        completedAt: new Date().toISOString(),
      },
    });
    await completeLocalisationAudit({
      auditId: second.audit.id,
      attemptNumber: 1,
      score: 62,
      teaser: {
        score: 62,
        domainKey: keys[1]!,
        domainSlug: second.audit.domainSlug,
        detectedLocales: [],
        headlineFindings: [],
        findingsCount: 4,
        pagesCrawled: 8,
        completedAt: new Date().toISOString(),
      },
      report: {
        score: 62,
        domainKey: keys[1]!,
        domainSlug: second.audit.domainSlug,
        sourceUrl: second.audit.sourceUrl,
        focusLocales: [],
        detectedLocales: [],
        findings: [],
        pages: [],
        linguisticNotes: [],
        pagesCrawled: 8,
        completedAt: new Date().toISOString(),
      },
    });

    const leaderboard = await listLocalisationAuditLeaderboard(50);
    const ranks = leaderboard.filter((entry) => keys.includes(entry.domainKey));
    expect(ranks[0]?.domainKey).toBe(keys[0]);
    expect(ranks[0]?.score).toBe(91);
    expect(ranks[1]?.domainKey).toBe(keys[1]);

    const standing = await getLocalisationAuditStanding({
      domainSlug: second.audit.domainSlug,
      score: 62,
    });
    expect(standing).toBeTruthy();
    expect(standing!.rank).toBeGreaterThanOrEqual(2);
    expect(standing!.total).toBeGreaterThanOrEqual(2);
    expect(standing!.averageScore).toBeGreaterThan(0);
  });
});
