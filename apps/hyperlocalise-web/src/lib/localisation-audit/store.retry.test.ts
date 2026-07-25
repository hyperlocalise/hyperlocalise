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
  consumeLocalisationAuditReportToken,
  failLocalisationAudit,
  isLocalisationAuditRetryable,
  upsertLocalisationAuditLeadForDelivery,
} from "./store";
import { LOCALISATION_AUDIT_STALE_MS } from "./types";

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
  });

  it("consumes report tokens once and rejects reuse", async () => {
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

    const first = await consumeLocalisationAuditReportToken({
      domainSlug: created.audit.domainSlug,
      token: upsert.token,
    });
    expect(first?.lead.deliveryStatus).toBe("verified");

    const second = await consumeLocalisationAuditReportToken({
      domainSlug: created.audit.domainSlug,
      token: upsert.token,
    });
    expect(second).toBeNull();

    await db
      .delete(schema.localisationAudits)
      .where(and(eq(schema.localisationAudits.id, created.audit.id)));
  });
});
