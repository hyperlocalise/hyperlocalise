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
import { afterEach, describe, expect, it } from "vite-plus/test";

import { db, schema } from "@/lib/database";

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
  upsertLocalisationAuditLeadForDelivery,
  verifyLocalisationAuditReportToken,
} from "./store";
import {
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

  afterEach(async () => {
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

describe("localisation audit leaderboard", () => {
  const keys = [`lb-a-${Date.now()}.example`, `lb-b-${Date.now()}.example`];

  afterEach(async () => {
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
