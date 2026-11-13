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
import { describe, expect, it } from "vite-plus/test";

import { IntegrationDetailPage } from "@/components/marketing/integrations/integration-detail-page";
import { getMarketingIntegrationBySlug } from "@/components/marketing/integrations/integrations-page-content";

function renderDetailPage(slug: string) {
  const integration = getMarketingIntegrationBySlug("en", slug);
  expect(integration).not.toBeNull();

  return render(
    <IntlProvider locale="en" messages={{}} onError={() => undefined}>
      <IntegrationDetailPage integration={integration!} locale="en" />
    </IntlProvider>,
  );
}

describe("IntegrationDetailPage", () => {
  it("uses the outcome headline as the GitHub H1 and keeps one demo CTA", () => {
    renderDetailPage("github");

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Catch missing translations before the GitHub PR merges",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1, name: "GitHub" })).not.toBeInTheDocument();
    expect(screen.getAllByText("Request a demo")).toHaveLength(2);
    expect(screen.queryByRole("link", { name: "Connect in workspace" })).not.toBeInTheDocument();
    expect(screen.queryByText("Visual workflow examples")).not.toBeInTheDocument();
    expect(screen.queryByText("Products")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "How it works" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "What you get" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Questions" })).toBeInTheDocument();
    expect(screen.getByText("PR opened on GitHub")).toBeInTheDocument();
    expect(screen.queryByText("Catch missing translations before merge")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Ship localization fixes from review findings"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Sync release branches to your TMS")).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "See how localisation runs in pull requests" }),
    ).toHaveAttribute("href", "/en/use-cases/github-release-localisation");
  });

  it("renders Slack as an evaluator landing with setup that starts after a demo", () => {
    renderDetailPage("slack");

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Review translations in the Slack thread that owns the launch",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "After a demo or sign-in, connect Slack and authorize the workspace that should receive review requests.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Sign in to workspace" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Jira Coming soon/ })).toBeInTheDocument();
  });
});
