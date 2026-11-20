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
import { IntlProvider } from "react-intl";
import { describe, expect, it, vi } from "vite-plus/test";

import { LocalisationAuditResultPage } from "./localisation-audit-result-page";
import {
  createRunningAudit,
  createSucceededAudit,
  localisationAuditRelatedScores,
  localisationAuditStanding,
} from "./localisation-audit.fixture";

vi.mock("@workos-inc/authkit-nextjs/components", () => ({
  useAuth: () => ({ user: null, loading: false, featureFlags: {} }),
}));

vi.mock("@/lib/analytics/client", () => ({
  clientAnalytics: { track: vi.fn() },
}));

vi.mock("@/lib/analytics/posthog-client", () => ({
  capturePostHogClientEvent: vi.fn(),
  capturePostHogClientException: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

vi.mock("next/image", () => ({
  default: ({ alt, ...props }: { alt: string }) => <img alt={alt} {...props} />,
}));

describe("LocalisationAuditResultPage", () => {
  it("shows the rerun cooldown without crashing the report", () => {
    const audit = {
      ...createSucceededAudit(),
      rerunnable: false,
      rerunAvailableAt: "2026-08-02T12:00:00.000Z",
    };

    render(
      <IntlProvider locale="en" messages={{}} onError={() => undefined}>
        <LocalisationAuditResultPage
          locale="en"
          domainSlug={audit.domainSlug}
          standing={localisationAuditStanding(audit.score ?? 0)}
          relatedScores={localisationAuditRelatedScores()}
          audit={audit}
        />
      </IntlProvider>,
    );

    expect(screen.getByRole("heading", { name: "Acme" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Related scores" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Northstar, score 91 out of 100" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "See all public scores" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Audit your site" })).toBeTruthy();
    expect(
      screen.getByText(
        "This report is for acme.example. Enter your URL to get the same localisation score.",
      ),
    ).toBeTruthy();
    expect(screen.getByPlaceholderText("https://your-site.com")).toBeTruthy();
    expect(screen.getByText(/You can re-run this audit once a day/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Re-run audit" })).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("explains how the score is built and ranks fixes by points gained", () => {
    const audit = createSucceededAudit();

    render(
      <IntlProvider locale="en" messages={{}} onError={() => undefined}>
        <LocalisationAuditResultPage
          locale="en"
          domainSlug={audit.domainSlug}
          standing={localisationAuditStanding(audit.score ?? 0)}
          audit={audit}
        />
      </IntlProvider>,
    );

    expect(screen.getByRole("heading", { name: "How your score is built" })).toBeTruthy();
    expect(screen.getByText("Perfect score")).toBeTruthy();
    expect(screen.getByText("Your score")).toBeTruthy();
    expect(screen.getAllByText("potential gain").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/^\+\d+\.\d pts$/).length).toBeGreaterThan(0);
    expect(screen.getByRole("group", { name: "Filter checks by dimension" })).toBeTruthy();
  });

  it("shows the live crawl summary while the audit runs", () => {
    const audit = createRunningAudit({ progressStage: "analyzing" });

    render(
      <IntlProvider locale="en" messages={{}} onError={() => undefined}>
        <LocalisationAuditResultPage
          locale="en"
          domainSlug={audit.domainSlug}
          standing={null}
          audit={audit}
        />
      </IntlProvider>,
    );

    expect(screen.getByRole("heading", { name: "Auditing acme.example" })).toBeTruthy();
    expect(screen.getByRole("progressbar", { name: "Audit progress" })).toBeTruthy();
    expect(screen.getByText("6 pages sampled")).toBeTruthy();
    expect(screen.getByText("3 languages found")).toBeTruthy();
    expect(screen.getByText("/pricing")).toBeTruthy();
    expect(screen.getByText("Step 4 of 5")).toBeTruthy();
  });
});
