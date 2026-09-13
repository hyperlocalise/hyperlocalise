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
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IntlProvider } from "react-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { getResearchPrototypeDomain } from "@/lib/domains/research-prototype";
import { getPrototypeSearchConsoleSnapshot } from "@/lib/gsc/prototype";
import type { GscPerformanceSnapshot } from "@/lib/gsc/types";

import { DomainSearchConsoleView } from "./domain-search-console-view";

const mocks = vi.hoisted(() => ({
  snapshot: null as GscPerformanceSnapshot | null,
  live: false,
  isPending: false,
  isError: false,
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("./use-domain-search-console", () => ({
  domainSearchConsoleQueryKey: (
    organizationSlug: string,
    linkedDomainId: string,
    localeId: string | null,
    dateRange: string,
  ) => ["domain-search-console", organizationSlug, linkedDomainId, localeId, dateRange],
  useDomainSearchConsole: () => ({
    live: mocks.live,
    data: mocks.snapshot,
    isPending: mocks.isPending,
    isError: mocks.isError,
  }),
}));

vi.mock("../store/domains-store-context", () => ({
  useDomainResearchShellStore: () => ({
    organizationSlug: "acme",
    linkedDomainId: "hyperlocalise-com",
    localeId: "france-fr",
    domain: getResearchPrototypeDomain("hyperlocalise-com"),
  }),
}));

function renderView() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <IntlProvider locale="en">
      <QueryClientProvider client={queryClient}>
        <DomainSearchConsoleView organizationSlug="acme" linkedDomainId="hyperlocalise-com" />
      </QueryClientProvider>
    </IntlProvider>,
  );
}

describe("DomainSearchConsoleView", () => {
  beforeEach(() => {
    mocks.snapshot = getPrototypeSearchConsoleSnapshot("hyperlocalise.com");
    mocks.live = false;
    mocks.isPending = false;
    mocks.isError = false;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders sample Search Console queries for preview domains", () => {
    renderView();
    expect(
      screen.getByText("Sample Search Console data for this preview domain."),
    ).toBeInTheDocument();
    expect(screen.getByText("traduction automatique")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Connect Google" })).not.toBeInTheDocument();
  });

  it("prompts to connect when Search Console is disconnected", () => {
    mocks.live = true;
    mocks.snapshot = {
      ...getPrototypeSearchConsoleSnapshot("hyperlocalise.com"),
      status: "disconnected",
      connection: null,
      siteUrl: null,
    };
    renderView();
    expect(screen.getByText("Connect Search Console")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Connect Google" })).toHaveAttribute(
      "href",
      "/api/orgs/acme/gsc-connections/authorize?returnTo=%2Forg%2Facme%2Fdomains%2Fhyperlocalise-com%2Fsearch-console%3Flocale%3Dfrance-fr",
    );
  });

  it("inspects a URL on a live connected property", async () => {
    mocks.live = true;
    mocks.snapshot = {
      ...getPrototypeSearchConsoleSnapshot("hyperlocalise.com"),
      status: "ready",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          inspection: {
            indexStatusResult: { verdict: "PASS", coverageState: "Submitted and indexed" },
            inspectionResultLink: "https://search.google.com/search-console",
          },
        }),
      }),
    );
    renderView();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Page URL"), "https://hyperlocalise.com/fr");
    await user.click(screen.getByRole("button", { name: "Inspect" }));
    expect(await screen.findByText("PASS")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open in Search Console" })).toHaveAttribute(
      "href",
      "https://search.google.com/search-console",
    );
  });
});
