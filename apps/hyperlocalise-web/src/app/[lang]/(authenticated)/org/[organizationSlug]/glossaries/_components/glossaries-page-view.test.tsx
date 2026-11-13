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

import type { ReactElement, ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import { describe, expect, it, vi } from "vite-plus/test";

import { createEmptyGlossaryFormFixture } from "./glossaries.fixture";
import { GlossariesPageView } from "./glossaries-page-view";

vi.mock("next/navigation", () => ({
  usePathname: () => "/org/acme/glossaries",
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

function renderPage(overrides: Partial<Parameters<typeof GlossariesPageView>[0]> = {}) {
  const ui: ReactElement = (
    <IntlProvider locale="en" messages={{}}>
      <GlossariesPageView
        organizationSlug="acme"
        nativeGlossaries={[]}
        externalGlossaries={[]}
        nativeTotal={0}
        externalTotal={0}
        nativeQuery={{ isLoading: false, isError: false, isSuccess: true, error: null }}
        externalQuery={{ isLoading: false, isError: false, isSuccess: true, error: null }}
        allowCreateGlossaries={true}
        hasConnectedProvider={false}
        useLiveProviderGlossaries={false}
        useLiveCrowdinGlossaries={false}
        connectedProviderKinds={[]}
        selectedExternalProjectId=""
        onSelectedExternalProjectIdChange={vi.fn()}
        searchQuery=""
        onSearchQueryChange={vi.fn()}
        hasActiveFilters={false}
        activeFilterCount={0}
        onClearFilters={vi.fn()}
        nativeHasMore={false}
        nativeIsLoadingMore={false}
        onNativeLoadMore={vi.fn()}
        externalHasMore={false}
        externalIsLoadingMore={false}
        onExternalLoadMore={vi.fn()}
        crowdinOrderBy="createdAt desc,name"
        onCrowdinOrderByChange={vi.fn()}
        createDialogOpen={false}
        onCreateDialogOpenChange={vi.fn()}
        createForm={createEmptyGlossaryFormFixture()}
        onCreateFormChange={vi.fn()}
        projects={[]}
        createErrors={{}}
        isCreating={false}
        onSubmitCreateGlossary={vi.fn()}
        {...overrides}
      />
    </IntlProvider>
  );

  return render(ui);
}

describe("GlossariesPageView", () => {
  it("keeps a Provider section and Integrations link when nothing is connected", () => {
    renderPage();

    expect(screen.getByText("TMS")).toBeInTheDocument();
    expect(screen.getByText("Connect a TMS provider")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Connect a provider" })).toHaveAttribute(
      "href",
      "/org/acme/integrations",
    );
  });
});
