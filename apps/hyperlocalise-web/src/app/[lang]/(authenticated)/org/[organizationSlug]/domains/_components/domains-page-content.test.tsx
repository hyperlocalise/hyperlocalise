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

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <IntlProvider locale="en">
      <QueryClientProvider client={queryClient}>
        <DomainsPageContent organizationSlug="acme" />
      </QueryClientProvider>
    </IntlProvider>,
  );
}

describe("domains page content", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not show prototype domains when the workspace has none linked", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ linkedDomains: [] }),
      }),
    );
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("No linked domains yet")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Link domain" })).toBeInTheDocument();
    expect(screen.queryByText("hyperlocalise.com")).not.toBeInTheDocument();
  });

  it("renders linked domains returned by the API", async () => {
    const domain = listResearchPrototypeDomains()[0]!;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
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
        }),
      }),
    );
    renderPage();
    expect(await screen.findByText("hyperlocalise.com")).toBeInTheDocument();
  });
});
