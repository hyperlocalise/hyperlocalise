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
import userEvent from "@testing-library/user-event";
import { IntlProvider } from "react-intl";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
  getResearchPrototypeCatalog,
  getResearchPrototypeDomain,
  type DomainResearchCatalog,
} from "@/lib/domains/research-prototype";
import type { LinkedDomainPublic } from "@/lib/linked-domains/types";
import { DomainResearchShell } from "./domain-research-shell";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  search: "locale=france-fr",
  catalog: null as DomainResearchCatalog | null,
  linkedDomain: undefined as LinkedDomainPublic | undefined,
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
    data: mocks.catalog
      ? { catalog: mocks.catalog, linkedDomain: mocks.linkedDomain }
      : { catalog: null, linkedDomain: mocks.linkedDomain },
    isPending: mocks.isPending,
    isError: mocks.isError,
  }),
}));

vi.mock("./add-domain-dialog", () => ({
  AddDomainDialog: ({ open }: { open: boolean }) => (open ? <div>edit locales dialog</div> : null),
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
    mocks.linkedDomain = undefined;
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

  it("opens Edit locales from research when the domain is verified", async () => {
    const domain = getResearchPrototypeDomain("hyperlocalise-com")!;
    mocks.linkedDomain = linkedDomainFixture(domain.id, domain.domainKey, ["france-fr"]);
    renderShell(
      <DomainResearchShell
        organizationSlug="acme"
        linkedDomainId="hyperlocalise-com"
        surface="overview"
        canEditLocales
      >
        research
      </DomainResearchShell>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Edit locales" }));
    expect(screen.getByText("edit locales dialog")).toBeInTheDocument();
  });

  it("shows an empty-locale state with Edit locales", () => {
    const domain = getResearchPrototypeDomain("hyperlocalise-com")!;
    mocks.catalog = {
      ...mocks.catalog!,
      domain: { ...domain, locales: [] },
    };
    mocks.linkedDomain = linkedDomainFixture(domain.id, domain.domainKey, []);
    renderShell(
      <DomainResearchShell
        organizationSlug="acme"
        linkedDomainId="hyperlocalise-com"
        surface="overview"
        canEditLocales
      >
        research
      </DomainResearchShell>,
    );

    expect(screen.getByText("No research locales yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit locales" })).toBeInTheDocument();
    expect(screen.queryByText("research")).not.toBeInTheDocument();
  });
});

function linkedDomainFixture(
  id: string,
  domainKey: string,
  marketIds: string[],
): LinkedDomainPublic {
  return {
    id,
    organizationId: "org_acme",
    domainKey,
    domainSlug: "hyperlocalise-com",
    sourceUrl: `https://${domainKey}`,
    marketIds,
    status: "verified",
    preferredMethod: null,
    verifiedMethod: "dns_txt",
    verifiedAt: "2026-01-01T00:00:00.000Z",
    localisationAuditId: null,
    projectId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    challenges: {
      token: "t",
      dnsTxt: { host: "_hyperlocalise-verify", value: "t" },
      htmlFile: { path: "/p", url: "https://x/p", body: "t" },
      metaTag: { html: "<meta />" },
    },
    auditScore: null,
  };
}
