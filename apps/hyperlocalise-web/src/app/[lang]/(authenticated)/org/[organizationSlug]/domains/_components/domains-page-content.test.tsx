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

import { DomainResearchPreviewProvider } from "./domain-research-preview";
import { DomainsPageContent } from "./domains-page-content";

vi.mock("next/navigation", () => ({
  usePathname: () => "/en/org/acme/domains",
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

function renderPage({ preview = false }: { preview?: boolean } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const page = <DomainsPageContent organizationSlug="acme" />;
  return render(
    <IntlProvider locale="en">
      <QueryClientProvider client={queryClient}>
        {preview ? (
          <DomainResearchPreviewProvider organizationSlug="acme">
            {page}
          </DomainResearchPreviewProvider>
        ) : (
          page
        )}
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
    expect(screen.queryByText("hyperlocalise.com")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Link domain" })).not.toBeInTheDocument();
  });

  it("keeps prototype domains in the Storybook preview", async () => {
    renderPage({ preview: true });
    expect(await screen.findByText("hyperlocalise.com")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Link domain" })).toBeInTheDocument();
  });
});
