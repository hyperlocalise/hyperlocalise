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
import type { ReactElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
  getResearchPrototypeCatalog,
  getResearchPrototypeDomain,
  type DomainResearchCatalog,
} from "@/lib/domains/research-prototype";
import { DomainResearchShell } from "./domain-research-shell";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  search: "locale=france-fr",
  catalog: null as DomainResearchCatalog | null,
  isPending: false,
  isError: false,
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(mocks.search),
  usePathname: () => "/en/org/acme/domains/hyperlocalise-com",
}));

vi.mock("@/lib/navigation/use-org-router", () => ({
  useOrgRouter: () => ({
    push: vi.fn(),
    replace: mocks.replace,
  }),
}));

vi.mock("./use-live-domain-research", () => ({
  useLiveDomainResearch: () => ({
    live: true,
    data: mocks.catalog ? { catalog: mocks.catalog } : { catalog: null },
    isPending: mocks.isPending,
    isError: mocks.isError,
  }),
}));

function renderShell(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <IntlProvider locale="en">{ui}</IntlProvider>
    </QueryClientProvider>,
  );
}

describe("domain research locale URL", () => {
  beforeEach(() => {
    mocks.replace.mockReset();
    mocks.search = "locale=france-fr";
    mocks.isPending = false;
    mocks.isError = false;
    mocks.catalog = getResearchPrototypeCatalog("hyperlocalise-com", "france-fr");
  });

  it("replaces a removed locale in the URL with the fallback locale", () => {
    const domain = getResearchPrototypeDomain("hyperlocalise-com")!;
    mocks.catalog = {
      ...mocks.catalog!,
      domain: { ...domain, locales: domain.locales.slice(1) },
    };
    renderShell(
      <DomainResearchShell
        organizationSlug="acme"
        linkedDomainId="hyperlocalise-com"
        surface="overview"
      >
        research
      </DomainResearchShell>,
    );
    expect(mocks.replace).toHaveBeenCalledWith(
      "/org/acme/domains/hyperlocalise-com?locale=germany-de",
      { scroll: false },
    );
  });

  it("keeps a supported locale in the URL", () => {
    renderShell(
      <DomainResearchShell
        organizationSlug="acme"
        linkedDomainId="hyperlocalise-com"
        surface="overview"
      >
        research
      </DomainResearchShell>,
    );
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("does not fall back to prototype catalogs when research is missing", () => {
    mocks.catalog = null;
    renderShell(
      <DomainResearchShell
        organizationSlug="acme"
        linkedDomainId="hyperlocalise-com"
        surface="overview"
      >
        research
      </DomainResearchShell>,
    );
    expect(screen.queryByText("hyperlocalise.com")).not.toBeInTheDocument();
    expect(screen.getByText("Domain not found")).toBeInTheDocument();
  });

  it("renders Search Console when the locale has no keyword catalog", () => {
    mocks.search = "locale=germany-de";
    renderShell(
      <DomainResearchShell
        organizationSlug="acme"
        linkedDomainId="hyperlocalise-com"
        surface="search-console"
      >
        search console body
      </DomainResearchShell>,
    );
    expect(screen.getByText("search console body")).toBeInTheDocument();
    expect(screen.queryByText("No research for this locale yet")).not.toBeInTheDocument();
  });
});
