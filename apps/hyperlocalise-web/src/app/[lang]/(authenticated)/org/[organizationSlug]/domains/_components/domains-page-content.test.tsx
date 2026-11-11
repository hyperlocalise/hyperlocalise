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
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { listResearchPrototypeDomains } from "@/lib/domains/research-prototype";
import { DomainsPageContent } from "./domains-page-content";

const listLinkedDomains = vi.fn();

vi.mock("@/lib/go-svc/use-go-svc-client", () => ({
  useGoSvcClient: () => ({
    client: {
      domains: {
        listLinkedDomains,
      },
      project: {
        list: vi.fn().mockResolvedValue({ projects: [] }),
      },
    },
    loading: false,
  }),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/en/org/acme/domains",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

function renderPage({ allowLinkDomains = true }: { allowLinkDomains?: boolean } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <IntlProvider locale="en">
      <QueryClientProvider client={queryClient}>
        <DomainsPageContent organizationSlug="acme" allowLinkDomains={allowLinkDomains} />
      </QueryClientProvider>
    </IntlProvider>,
  );
}

describe("domains page content", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    listLinkedDomains.mockReset();
  });

  it("does not show prototype domains when the workspace has none linked", async () => {
    listLinkedDomains.mockResolvedValue({ linkedDomains: [] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("No linked domains yet")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Add a domain" })).toBeInTheDocument();
    expect(screen.queryByText("hyperlocalise.com")).not.toBeInTheDocument();
  });

  it("hides the link action when the user cannot create projects", async () => {
    listLinkedDomains.mockResolvedValue({ linkedDomains: [] });
    renderPage({ allowLinkDomains: false });
    await waitFor(() => {
      expect(screen.getByText("No linked domains yet")).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: "Add a domain" })).not.toBeInTheDocument();
  });

  it("renders linked domains returned by the API", async () => {
    const domain = listResearchPrototypeDomains()[0]!;
    listLinkedDomains.mockResolvedValue({
      linkedDomains: [
        {
          id: domain.id,
          domainKey: domain.domainKey,
          domainSlug: domain.id,
          sourceUrl: domain.sourceUrl,
          status: domain.status,
          auditScore: domain.score,
        },
      ],
    });
    renderPage();
    expect(await screen.findByText("hyperlocalise.com")).toBeInTheDocument();
  });

  it("shows no locale badges when marketIds is an empty array", async () => {
    const domain = listResearchPrototypeDomains()[0]!;
    listLinkedDomains.mockResolvedValue({
      linkedDomains: [
        {
          id: domain.id,
          domainKey: domain.domainKey,
          domainSlug: domain.id,
          sourceUrl: domain.sourceUrl,
          status: "verified",
          auditScore: domain.score,
          marketIds: [],
        },
      ],
    });
    renderPage();
    expect(await screen.findByText("hyperlocalise.com")).toBeInTheDocument();
    expect(screen.queryByText("French (France)")).not.toBeInTheDocument();
  });

  it("shows Edit locales for verified domains when linking is allowed", async () => {
    const domain = listResearchPrototypeDomains()[0]!;
    listLinkedDomains.mockResolvedValue({
      linkedDomains: [
        {
          id: domain.id,
          domainKey: domain.domainKey,
          domainSlug: domain.id,
          sourceUrl: domain.sourceUrl,
          status: "verified",
          auditScore: domain.score,
          marketIds: ["france-fr"],
        },
      ],
    });
    renderPage();
    expect(await screen.findByRole("button", { name: "Edit locales" })).toBeInTheDocument();
  });

  it("shows pending direct claims without linking to a removed page", async () => {
    const domain = listResearchPrototypeDomains()[0]!;
    listLinkedDomains.mockResolvedValue({
      linkedDomains: [
        {
          id: domain.id,
          domainKey: "shop.example.com",
          domainSlug: "shop-example-com",
          sourceUrl: "https://shop.example.com/",
          status: "pending_verification",
          auditScore: null,
          locales: [],
        },
      ],
    });

    renderPage();

    expect(await screen.findByText("shop.example.com")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Verify" })).not.toBeInTheDocument();
  });

  it("shows pending audit claims without linking to a removed page", async () => {
    listLinkedDomains.mockResolvedValue({
      linkedDomains: [
        {
          id: "audit-claim",
          domainKey: "audit.example.com",
          domainSlug: "audit-example-com",
          sourceUrl: "https://audit.example.com/",
          status: "pending_verification",
          localisationAuditId: "audit-id",
          auditScore: 80,
          locales: [],
        },
      ],
    });

    renderPage();

    expect(await screen.findByText("audit.example.com")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Verify" })).not.toBeInTheDocument();
  });
});
