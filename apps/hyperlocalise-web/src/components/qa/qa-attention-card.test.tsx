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

import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import { describe, expect, it, vi } from "vite-plus/test";

import { summarizeQaAttention, type QaAttention } from "@/lib/qa/use-workspace-qa-reports";

import { qaWorkspaceReports } from "./qa.fixture";
import { QaAttentionCardView } from "./qa-attention-card";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

function renderCard(attention: QaAttention, scope: "workspace" | "project" = "workspace") {
  return render(
    <IntlProvider locale="en" messages={{}}>
      <QaAttentionCardView attention={attention} scope={scope} href="/org/acme/qa" />
    </IntlProvider>,
  );
}

describe("summarizeQaAttention", () => {
  it("counts errors from completed scans and failed scans across the workspace", () => {
    expect(summarizeQaAttention(qaWorkspaceReports)).toEqual({
      errors: 2,
      projectsWithErrors: 1,
      failedScans: 1,
    });
  });

  it("limits counts to one project", () => {
    const [website] = qaWorkspaceReports;
    expect(summarizeQaAttention(qaWorkspaceReports, website!.projectId)).toEqual({
      errors: 2,
      projectsWithErrors: 1,
      failedScans: 0,
    });
    expect(summarizeQaAttention(undefined)).toEqual({
      errors: 0,
      projectsWithErrors: 0,
      failedScans: 0,
    });
  });
});

describe("QaAttentionCardView", () => {
  it("renders nothing when QA is clean", () => {
    const { container } = renderCard({ errors: 0, projectsWithErrors: 0, failedScans: 0 });
    expect(container).toBeEmptyDOMElement();
  });

  it("summarises errors and failed scans with a link to QA", () => {
    renderCard({ errors: 3, projectsWithErrors: 2, failedScans: 1 });
    expect(screen.getByRole("region", { name: "3 QA errors need fixing" })).toBeInTheDocument();
    expect(
      screen.getByText("Found across 2 projects by the latest completed scans."),
    ).toBeInTheDocument();
    expect(screen.getByText("1 QA scan failed")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Review QA" })).toHaveAttribute("href", "/org/acme/qa");
  });

  it("explains stale results when only a scan failed", () => {
    renderCard({ errors: 0, projectsWithErrors: 0, failedScans: 1 }, "project");
    expect(screen.getByRole("region", { name: "1 QA scan failed" })).toBeInTheDocument();
    expect(
      screen.getByText("QA results may be out of date until the scan runs again."),
    ).toBeInTheDocument();
  });
});
