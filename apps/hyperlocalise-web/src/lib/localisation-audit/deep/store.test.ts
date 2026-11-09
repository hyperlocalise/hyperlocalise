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
import "dotenv/config";

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { db, schema } from "@/lib/database/client";

import type { LocalisationAuditCrawledPage } from "../types";
import {
  completeDeepAudit,
  failDeepAudit,
  findPreviousDeepAuditFingerprints,
  insertDeepAuditPages,
  listDeepAuditPages,
  markDeepAuditCrawling,
  markDeepAuditScoring,
} from "./store";
import type { LocalisationDeepAuditSummary } from "./types";

const fixture = createAuthTestFixture();

async function seed() {
  const { organization } = await fixture.createLocalWorkosIdentity();
  const suffix = randomUUID().slice(0, 8);
  const [domain] = await db
    .insert(schema.linkedDomains)
    .values({
      organizationId: organization.id,
      domainKey: `store-${suffix}.example.com`,
      domainSlug: `store-${suffix}`,
      sourceUrl: `https://store-${suffix}.example.com/`,
      status: "verified",
      verificationToken: `token-${suffix}`,
    })
    .returning();
  const createRun = async () => {
    const [run] = await db
      .insert(schema.localisationDeepAudits)
      .values({ organizationId: organization.id, linkedDomainId: domain!.id })
      .returning();
    return run!;
  };
  return { organizationId: organization.id, linkedDomainId: domain!.id, createRun };
}

function artifact(url: string): LocalisationAuditCrawledPage {
  return { url, status: 200, hreflang: [], anchors: [] } as unknown as LocalisationAuditCrawledPage;
}

const summary = {
  credits: [],
  creditStats: {},
  detectedLocales: [],
  localeCoverageFactor: 1,
  templates: [],
  pagesCrawled: 1,
  findingsCount: 1,
  diff: null,
  linguisticNotes: [],
} satisfies LocalisationDeepAuditSummary;

const dimensionScores = { technical: 80, linguistic: null, contextual: null, visual: null };

async function runStatus(id: string) {
  const [row] = await db
    .select()
    .from(schema.localisationDeepAudits)
    .where(eq(schema.localisationDeepAudits.id, id));
  return row!;
}

describe("deep audit store", () => {
  afterEach(async () => {
    await fixture.cleanup();
  });

  it("accepts pages only while crawling and counts each URL once", async () => {
    const { organizationId, createRun } = await seed();
    const run = await createRun();
    const page = {
      url: "https://example.com/de/a",
      locale: "de",
      templateKey: "/a",
      artifact: artifact("https://example.com/de/a"),
    };

    expect(await insertDeepAuditPages({ runId: run.id, organizationId, pages: [page] })).toEqual({
      inserted: 0,
      accepted: false,
    });

    expect(await markDeepAuditCrawling(run.id)).toBe(true);
    expect(await markDeepAuditCrawling(run.id)).toBe(false);
    expect(await insertDeepAuditPages({ runId: run.id, organizationId, pages: [page] })).toEqual({
      inserted: 1,
      accepted: true,
    });
    expect(await insertDeepAuditPages({ runId: run.id, organizationId, pages: [page] })).toEqual({
      inserted: 0,
      accepted: true,
    });
    expect((await runStatus(run.id)).pagesRendered).toBe(1);
    expect(await listDeepAuditPages(run.id)).toHaveLength(1);
  });

  it("completes only a scoring run and diffs against the previous succeeded run", async () => {
    const { organizationId, linkedDomainId, createRun } = await seed();
    const first = await createRun();
    await markDeepAuditCrawling(first.id);
    await markDeepAuditScoring(first.id);
    const finding = {
      creditId: "html-lang",
      dimension: "technical",
      severity: "high" as const,
      title: "Missing lang",
      summary: "No lang attribute.",
      url: "https://example.com/",
      templateKey: "/",
      locale: null,
      location: null,
      evidence: null,
      advice: null,
      confidence: null,
      fingerprint: "fp-1",
      diffState: "new" as const,
    };
    expect(
      await completeDeepAudit({
        runId: first.id,
        organizationId,
        score: 80,
        dimensionScores,
        summary,
        previousRunId: null,
        findings: [finding],
      }),
    ).toBe(true);
    expect((await runStatus(first.id)).status).toBe("succeeded");

    const second = await createRun();
    const previous = await findPreviousDeepAuditFingerprints({ linkedDomainId, runId: second.id });
    expect(previous?.runId).toBe(first.id);
    expect([...(previous?.fingerprints ?? [])]).toEqual(["fp-1"]);

    // Cancelled while scoring: completion is refused and nothing is written.
    await markDeepAuditCrawling(second.id);
    await markDeepAuditScoring(second.id);
    await db
      .update(schema.localisationDeepAudits)
      .set({ status: "cancelled" })
      .where(eq(schema.localisationDeepAudits.id, second.id));
    expect(
      await completeDeepAudit({
        runId: second.id,
        organizationId,
        score: 90,
        dimensionScores,
        summary,
        previousRunId: first.id,
        findings: [{ ...finding, diffState: "unchanged" }],
      }),
    ).toBe(false);
    const stored = await db
      .select()
      .from(schema.localisationDeepAuditFindings)
      .where(eq(schema.localisationDeepAuditFindings.runId, second.id));
    expect(stored).toHaveLength(0);

    await failDeepAudit({ runId: second.id, errorCode: "x", errorMessage: "y" });
    expect((await runStatus(second.id)).status).toBe("cancelled");
  });
});
