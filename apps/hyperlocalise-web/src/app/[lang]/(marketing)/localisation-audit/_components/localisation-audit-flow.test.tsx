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
// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IntlProvider } from "react-intl";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { LocalisationAuditFlow } from "./localisation-audit-flow";

vi.mock("@/components/marketing/marketing-footer", () => ({
  MarketingFooter: () => <footer data-testid="marketing-footer" />,
}));

const scored = {
  state: "scored" as const,
  score: 82,
  evaluatedRules: 8,
};

const findings = Array.from({ length: 4 }, (_, index) => ({
  id: `finding-${index + 1}`,
  category: index === 0 ? "technical" : "linguistic",
  severity: index === 0 ? "high" : "medium",
  title: `Finding ${index + 1}`,
  evidence: `Evidence ${index + 1}`,
  businessImpact: `Impact ${index + 1}`,
  recommendation: `Recommendation ${index + 1}`,
  confidence: "high",
}));

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("LocalisationAuditFlow", () => {
  it("completes discovery, confirmation, preview, and report unlock", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        jsonResponse({
          audit: {
            id: "audit-1",
            status: "awaiting_confirmation",
            detectedLocale: "fr-FR",
            alternatives: [
              {
                locale: "en-GB",
                url: "https://example.com/en",
              },
            ],
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          audit: {
            id: "audit-1",
            status: "completed",
            publicSlug: "shared-1",
            summary: {
              domain: "example.com",
              auditedAt: "2026-07-24T12:00:00.000Z",
              overallScore: scored,
              categories: {
                technical: scored,
                linguistic: {
                  state: "insufficient_evidence",
                  evaluatedRules: 2,
                },
                market: scored,
              },
              previewFindings: findings,
              lockedFindingCount: 6,
              limitations: [],
            },
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          report: {
            accessUrl: "/en/localisation-audit/report/private-token",
          },
        }),
      );

    render(
      <IntlProvider locale="en" messages={{}}>
        <LocalisationAuditFlow />
      </IntlProvider>,
    );

    await user.type(screen.getByRole("textbox", { name: "Website URL" }), "https://example.com/fr");
    await user.click(screen.getByRole("button", { name: "Check my website" }));

    expect(await screen.findByText("We found your localisation footprint")).toBeVisible();
    expect(screen.getByText("fr-FR")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "en-GB" }));
    const targetMarketInput = screen.getByRole("textbox", {
      name: "Target market country code",
    });
    expect(
      screen.getByText("Use a two-letter ISO country code such as FR, DE, or GB."),
    ).toBeVisible();
    await user.type(targetMarketInput, "gb");
    expect(targetMarketInput).toHaveValue("GB");
    await user.click(screen.getByRole("button", { name: "Run the full health check" }));

    expect(await screen.findByRole("heading", { name: "example.com" })).toBeVisible();
    expect(screen.getByText("Insufficient evidence")).toBeVisible();
    expect(screen.getByText("6 additional findings are in the full report")).toBeVisible();

    expect(screen.getByText("Finding 1")).toBeVisible();
    expect(screen.getByText("Finding 2")).toBeVisible();
    expect(screen.getByText("Finding 3")).toBeVisible();
    expect(screen.queryByText("Finding 4")).not.toBeInTheDocument();

    await user.type(
      screen.getByRole("textbox", { name: "Work email" }),
      "localisation@example.com",
    );
    await user.click(screen.getByRole("button", { name: "Email me the full report" }));

    const reportLinkLabel = await screen.findByText("Open the complete report");
    expect(reportLinkLabel.closest("a")).toHaveAttribute(
      "href",
      "/en/localisation-audit/report/private-token",
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/localisation-audit/audits",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ url: "https://example.com/fr" }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/localisation-audit/audits/audit-1/confirm",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          targetLocale: "en-GB",
          targetMarket: "GB",
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/localisation-audit/audits/audit-1/unlock",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          email: "localisation@example.com",
        }),
      }),
    );
  });
});
