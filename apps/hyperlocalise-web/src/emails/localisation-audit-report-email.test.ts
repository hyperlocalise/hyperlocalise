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
import { render } from "@react-email/render";
import { describe, expect, it } from "vite-plus/test";

import {
  LocalisationAuditReportEmail,
  localisationAuditReportEmailText,
} from "./localisation-audit-report-email";

describe("localisation audit report email", () => {
  it("includes score, findings, and verify link in plain text", () => {
    const text = localisationAuditReportEmailText({
      domainKey: "example.com",
      score: 64,
      completedAt: "2026-07-25T00:00:00.000Z",
      findings: [
        {
          id: "f1",
          category: "technical",
          severity: "critical",
          title: "Missing hreflang returns",
          summary: "FR pages do not point back to EN.",
          where: 'Document head · <link rel="alternate" hreflang>',
          url: "https://example.com/fr",
          evidence: "FR /fr has no reciprocal EN alternate",
          advice: "Add reciprocal hreflang (including self and x-default) between EN and FR.",
        },
      ],
      verifyUrl: "https://app.example.test/api/localisation-audit/example-com/verify?token=abc",
    });

    expect(text).toContain("64/100");
    expect(text).toContain("Missing hreflang returns");
    expect(text).toContain("[critical]");
    expect(text).toContain('Found here: Document head · <link rel="alternate" hreflang>');
    expect(text).toContain("https://example.com/fr");
    expect(text).toContain("What we saw: FR /fr has no reciprocal EN alternate");
    expect(text).toContain(
      "How to fix it: Add reciprocal hreflang (including self and x-default) between EN and FR.",
    );
    expect(text).toContain("verify?token=abc");
    expect(text).toContain("example.com");
    expect(text).toContain("/en/blog/what-is-a-website-localisation-audit");
  });

  it("includes dimension scores when provided", () => {
    const text = localisationAuditReportEmailText({
      domainKey: "example.com",
      score: 78,
      completedAt: "2026-08-13T00:00:00.000Z",
      findings: [],
      verifyUrl: "https://app.example.test/verify",
      dimensionScores: { technical: 86, linguistic: 81, contextual: 76, visual: 68 },
    });

    expect(text).toContain("Technical: 86");
    expect(text).toContain("Visual: 68");
  });

  it("renders N/A for dimensions without a score", () => {
    const text = localisationAuditReportEmailText({
      domainKey: "example.com",
      score: 60,
      completedAt: "2026-08-13T00:00:00.000Z",
      findings: [],
      verifyUrl: "https://app.example.test/verify",
      dimensionScores: { technical: 80, linguistic: null, contextual: 40, visual: null },
    });

    expect(text).toContain("Technical: 80");
    expect(text).toContain("Linguistic: N/A");
    expect(text).toContain("Visual: N/A");
  });

  it("colors the HTML score and finding severity", async () => {
    const html = await render(
      LocalisationAuditReportEmail({
        domainKey: "example.com",
        score: 64,
        completedAt: "2026-08-13T00:00:00.000Z",
        findings: [
          {
            id: "f1",
            category: "technical",
            severity: "critical",
            title: "Missing hreflang returns",
            summary: "FR pages do not point back to EN.",
            where: 'Document head · <link rel="alternate" hreflang>',
            url: "https://example.com/fr",
            evidence: "FR /fr has no reciprocal EN alternate",
            advice: "Add reciprocal hreflang (including self and x-default) between EN and FR.",
          },
        ],
        verifyUrl: "https://app.example.test/verify",
        dimensionScores: { technical: 86, linguistic: 81, contextual: 76, visual: 42 },
      }),
    );

    expect(html).toContain("#aa4d00");
    expect(html).toContain("#ea001d");
    expect(html).toContain("#107d32");
    expect(html).toContain("#ecfdec");
    expect(html).toContain("#ffeeef");
    expect(html).toContain("Found here");
    expect(html).toContain("What we saw");
    expect(html).toContain("How to fix it");
    expect(html).toContain("Document head ·");
    expect(html).toContain("Add reciprocal hreflang");
    expect(html).toContain("/en/blog/what-is-a-website-localisation-audit");
    expect(html).toContain('href="https://example.com/fr"');
  });

  it("does not render unsafe or off-domain finding URLs as links", async () => {
    const html = await render(
      LocalisationAuditReportEmail({
        domainKey: "example.com",
        score: 64,
        completedAt: "2026-08-13T00:00:00.000Z",
        findings: [
          {
            id: "f1",
            category: "technical",
            severity: "critical",
            title: "Unsafe locator",
            summary: "Model copied a hostile URL.",
            where: "Hero · heading",
            url: "javascript:alert(1)",
          },
          {
            id: "f2",
            category: "contextual",
            severity: "high",
            title: "Off-site locator",
            summary: "Model copied a third-party URL.",
            url: "https://evil.example/phish",
          },
        ],
        verifyUrl: "https://app.example.test/verify",
      }),
    );
    const text = localisationAuditReportEmailText({
      domainKey: "example.com",
      score: 64,
      completedAt: "2026-08-13T00:00:00.000Z",
      findings: [
        {
          id: "f1",
          category: "technical",
          severity: "critical",
          title: "Unsafe locator",
          summary: "Model copied a hostile URL.",
          url: "javascript:alert(1)",
        },
        {
          id: "f2",
          category: "contextual",
          severity: "high",
          title: "Off-site locator",
          summary: "Model copied a third-party URL.",
          url: "https://evil.example/phish",
        },
      ],
      verifyUrl: "https://app.example.test/verify",
    });

    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("evil.example");
    expect(text).not.toContain("javascript:");
    expect(text).not.toContain("evil.example");
  });
});
