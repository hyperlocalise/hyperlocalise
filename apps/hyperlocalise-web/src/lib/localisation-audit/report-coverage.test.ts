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
import { describe, expect, it } from "vite-plus/test";

import {
  asPublishedLocalisationAudit,
  hasLocalisationAuditSuccessfulPage,
} from "./report-coverage";
import type { LocalisationAuditReport } from "./types";

function reportWithStatuses(statuses: number[]): LocalisationAuditReport {
  return {
    score: 39,
    domainKey: "canva.com",
    domainSlug: "canva-com",
    sourceUrl: "https://canva.com/",
    focusLocales: [],
    detectedLocales: [],
    findings: [],
    pages: statuses.map((status) => ({
      url: "https://canva.com/",
      status,
      htmlLang: null,
      title: null,
    })),
    linguisticNotes: [],
    pagesCrawled: statuses.length,
    completedAt: "2026-08-15T00:00:00.000Z",
  };
}

describe("asPublishedLocalisationAudit", () => {
  const base = {
    status: "succeeded" as const,
    score: 39,
    teaser: null,
    errorCode: null,
    errorMessage: null,
  };

  it("presents scores built only from blocked pages as blocked", () => {
    const published = asPublishedLocalisationAudit({
      ...base,
      report: reportWithStatuses([403, 403]),
    });
    expect(published.status).toBe("blocked");
    expect(published.score).toBeNull();
    expect(published.report).toBeNull();
    expect(published.errorCode).toBe("crawl_blocked");
  });

  it("keeps audits with at least one successful page", () => {
    const audit = { ...base, report: reportWithStatuses([403, 200]) };
    expect(asPublishedLocalisationAudit(audit)).toBe(audit);
  });

  it("leaves non-succeeded audits alone", () => {
    const audit = { ...base, status: "running" as const, report: null };
    expect(asPublishedLocalisationAudit(audit)).toBe(audit);
  });
});

describe("hasLocalisationAuditSuccessfulPage", () => {
  it("is true when any page returned 2xx", () => {
    expect(hasLocalisationAuditSuccessfulPage([{ status: 403 }, { status: 200 }])).toBe(true);
  });

  it("is false when every page was blocked or errored", () => {
    expect(hasLocalisationAuditSuccessfulPage([{ status: 403 }, { status: 403 }])).toBe(false);
    expect(hasLocalisationAuditSuccessfulPage([{ status: 301 }, { status: 500 }])).toBe(false);
  });

  it("is false for missing or empty page lists", () => {
    expect(hasLocalisationAuditSuccessfulPage([])).toBe(false);
    expect(hasLocalisationAuditSuccessfulPage(null)).toBe(false);
    expect(hasLocalisationAuditSuccessfulPage(undefined)).toBe(false);
  });
});
