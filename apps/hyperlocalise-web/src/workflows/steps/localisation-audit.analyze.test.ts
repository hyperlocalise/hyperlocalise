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
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const {
  buildProfileMock,
  blockMock,
  completeMock,
  creditsMock,
  failMock,
  findAuditMock,
  patchProfileMock,
  progressMock,
  trackMock,
} = vi.hoisted(() => ({
  buildProfileMock: vi.fn(),
  blockMock: vi.fn(),
  completeMock: vi.fn(),
  creditsMock: vi.fn(),
  failMock: vi.fn(),
  findAuditMock: vi.fn(),
  patchProfileMock: vi.fn(),
  progressMock: vi.fn(),
  trackMock: vi.fn(),
}));

vi.mock("@/lib/analytics/server", () => ({
  serverAnalytics: { track: trackMock },
}));

vi.mock("@/lib/localisation-audit/company-profile", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/localisation-audit/company-profile")>();
  return {
    ...actual,
    buildLocalisationAuditCompanyProfile: buildProfileMock,
  };
});

vi.mock("@/lib/localisation-audit/credits/runner", () => ({
  runLocalisationAuditCredits: creditsMock,
}));

vi.mock("@/lib/localisation-audit/store", () => ({
  blockLocalisationAudit: blockMock,
  completeLocalisationAudit: completeMock,
  failLocalisationAudit: failMock,
  findLocalisationAuditById: findAuditMock,
  listPendingLocalisationAuditLeads: vi.fn(),
  markLocalisationAuditLeadEmailFailed: vi.fn(),
  markLocalisationAuditLeadEmailQueued: vi.fn(),
  markLocalisationAuditProgress: progressMock,
  markLocalisationAuditRunning: vi.fn(),
  patchLocalisationAuditCompanyProfile: patchProfileMock,
  upsertLocalisationAuditLeadForDelivery: vi.fn(),
}));

import { emptyCrawledPage, EMPTY_SITEMAP_SIGNAL } from "@/lib/localisation-audit/types";

import { analyzeLocalisationAuditStep } from "./localisation-audit";

const inferredProfile = {
  name: "Acme",
  logoUrl: "https://acme.example/logo.png",
  productSummary: "Payments for global teams.",
  brandVoice: "calm, precise",
  industry: "Fintech",
  confidence: 80,
};

const pages = [
  emptyCrawledPage({
    url: "https://acme.example/",
    title: "Acme",
    metaDescription: "Payments for global teams.",
    iconHrefs: ["/logo.png"],
  }),
];

describe("analyzeLocalisationAuditStep company profile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    blockMock.mockResolvedValue({ id: "audit-1", status: "blocked" });
    buildProfileMock.mockResolvedValue(inferredProfile);
    completeMock.mockResolvedValue({ id: "audit-1" });
    creditsMock.mockResolvedValue({
      credits: [],
      findings: [],
      linguisticNotes: [],
      detectedLocales: [],
    });
    findAuditMock.mockResolvedValue({
      id: "audit-1",
      attemptNumber: 2,
      teaser: { score: 64, companyProfile: null },
      report: { score: 64 },
    });
    patchProfileMock.mockResolvedValue({ id: "audit-1" });
    progressMock.mockResolvedValue({ id: "audit-1" });
  });

  it("patches a missing profile before scoring on a re-run", async () => {
    const result = await analyzeLocalisationAuditStep({
      auditId: "audit-1",
      attemptNumber: 2,
      domainKey: "acme.example",
      domainSlug: "acme-example",
      sourceUrl: "https://acme.example/",
      focusLocales: [],
      pages,
      sitemap: EMPTY_SITEMAP_SIGNAL,
    });

    expect(result.ok).toBe(true);
    expect(patchProfileMock).toHaveBeenCalledWith({
      auditId: "audit-1",
      attemptNumber: 2,
      companyProfile: inferredProfile,
    });
    expect(creditsMock).toHaveBeenCalled();
    expect(patchProfileMock.mock.invocationCallOrder[0]).toBeLessThan(
      creditsMock.mock.invocationCallOrder[0]!,
    );
    expect(completeMock.mock.calls[0]?.[0].report.companyProfile).toEqual(inferredProfile);
    expect(completeMock.mock.calls[0]?.[0].teaser.companyProfile).toEqual(inferredProfile);
  });

  it("still patches the preserved report when scoring throws", async () => {
    creditsMock.mockRejectedValue(new Error("luna unavailable"));

    await expect(
      analyzeLocalisationAuditStep({
        auditId: "audit-1",
        attemptNumber: 2,
        domainKey: "acme.example",
        domainSlug: "acme-example",
        sourceUrl: "https://acme.example/",
        focusLocales: [],
        pages,
        sitemap: EMPTY_SITEMAP_SIGNAL,
      }),
    ).rejects.toThrow("luna unavailable");

    expect(patchProfileMock).toHaveBeenCalledWith({
      auditId: "audit-1",
      attemptNumber: 2,
      companyProfile: inferredProfile,
    });
    expect(completeMock).not.toHaveBeenCalled();
  });

  it("keeps a stored logo when the new crawl omits it", async () => {
    findAuditMock.mockResolvedValue({
      id: "audit-1",
      attemptNumber: 2,
      teaser: {
        companyProfile: {
          name: "Acme",
          logoUrl: "https://acme.example/old-logo.png",
          productSummary: null,
          brandVoice: null,
          industry: null,
          confidence: 40,
        },
      },
      report: { score: 64 },
    });
    buildProfileMock.mockResolvedValue({
      name: "Acme Inc",
      logoUrl: null,
      productSummary: "Payments for global teams.",
      brandVoice: "calm, precise",
      industry: "Fintech",
      confidence: 70,
    });

    await analyzeLocalisationAuditStep({
      auditId: "audit-1",
      attemptNumber: 2,
      domainKey: "acme.example",
      domainSlug: "acme-example",
      sourceUrl: "https://acme.example/",
      focusLocales: [],
      pages,
      sitemap: EMPTY_SITEMAP_SIGNAL,
    });

    const merged = {
      name: "Acme Inc",
      logoUrl: "https://acme.example/old-logo.png",
      productSummary: "Payments for global teams.",
      brandVoice: "calm, precise",
      industry: "Fintech",
      confidence: 70,
    };
    expect(patchProfileMock).toHaveBeenCalledWith({
      auditId: "audit-1",
      attemptNumber: 2,
      companyProfile: merged,
    });
    expect(completeMock.mock.calls[0]?.[0].report.companyProfile).toEqual(merged);
  });

  it("does not patch when the stored cover is already complete", async () => {
    findAuditMock.mockResolvedValue({
      id: "audit-1",
      attemptNumber: 2,
      teaser: { companyProfile: inferredProfile },
      report: { companyProfile: inferredProfile },
    });

    await analyzeLocalisationAuditStep({
      auditId: "audit-1",
      attemptNumber: 2,
      domainKey: "acme.example",
      domainSlug: "acme-example",
      sourceUrl: "https://acme.example/",
      focusLocales: [],
      pages,
      sitemap: EMPTY_SITEMAP_SIGNAL,
    });

    expect(patchProfileMock).not.toHaveBeenCalled();
    expect(completeMock.mock.calls[0]?.[0].report.companyProfile).toEqual(inferredProfile);
  });

  it("blocks the audit before profile inference or scoring when the domain blocks the crawl", async () => {
    const result = await analyzeLocalisationAuditStep({
      auditId: "audit-1",
      attemptNumber: 2,
      domainKey: "acme.example",
      domainSlug: "acme-example",
      sourceUrl: "https://acme.example/",
      focusLocales: [],
      pages: [],
      sitemap: EMPTY_SITEMAP_SIGNAL,
      blockedReason: "bot_protection",
    });

    expect(result).toEqual({ ok: false, code: "localisation_audit_blocked" });
    expect(blockMock).toHaveBeenCalledWith({
      auditId: "audit-1",
      attemptNumber: 2,
      errorCode: "crawl_blocked",
      errorMessage: expect.stringContaining("HyperlocaliseAuditBot/1.0"),
    });
    expect(buildProfileMock).not.toHaveBeenCalled();
    expect(creditsMock).not.toHaveBeenCalled();
    expect(completeMock).not.toHaveBeenCalled();
  });
});
