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

import { createEmptyMemoryFormFixture } from "./translation-memories.fixture";
import { TranslationMemoriesPageView } from "./translation-memories-page-view";

vi.mock("next/navigation", () => ({
  usePathname: () => "/org/acme/translation-memories",
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

function renderPage(overrides: Partial<Parameters<typeof TranslationMemoriesPageView>[0]> = {}) {
  const ui: ReactElement = (
    <IntlProvider locale="en" messages={{}}>
      <TranslationMemoriesPageView
        organizationSlug="acme"
        nativeMemories={[]}
        externalMemories={[]}
        nativeTotal={0}
        externalTotal={0}
        nativeQuery={{ isLoading: false, isError: false, isSuccess: true, error: null }}
        externalQuery={{ isLoading: false, isError: false, isSuccess: true, error: null }}
        allowCreateMemories={true}
        hasConnectedProvider={false}
        connectedProviderKinds={[]}
        useLiveProviderMemories={false}
        selectedExternalProjectId=""
        onSelectedExternalProjectIdChange={vi.fn()}
        searchQuery=""
        onSearchQueryChange={vi.fn()}
        sourceFilter="all"
        onSourceFilterChange={vi.fn()}
        projectFilter="all"
        onProjectFilterChange={vi.fn()}
        projects={[]}
        providerFilter="all"
        onProviderFilterChange={vi.fn()}
        syncFilter="all"
        onSyncFilterChange={vi.fn()}
        providerKinds={[]}
        hasExternalMemories={false}
        hasMemories={false}
        showNoFilterMatches={false}
        hasActiveFilters={false}
        onClearFilters={vi.fn()}
        nativeHasMore={false}
        nativeIsLoadingMore={false}
        onNativeLoadMore={vi.fn()}
        externalHasMore={false}
        externalIsLoadingMore={false}
        onExternalLoadMore={vi.fn()}
        createDialogOpen={false}
        onCreateDialogOpenChange={vi.fn()}
        createForm={createEmptyMemoryFormFixture()}
        onCreateFormChange={vi.fn()}
        createErrors={{}}
        isCreating={false}
        onSubmitCreateMemory={vi.fn()}
        onImportMemory={vi.fn()}
        {...overrides}
      />
    </IntlProvider>
  );

  return render(ui);
}

describe("TranslationMemoriesPageView", () => {
  it("keeps a Provider section and Integrations link when nothing is connected", () => {
    renderPage();

    expect(screen.getByText("TMS")).toBeInTheDocument();
    expect(screen.getByText("Connect a TMS provider")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Connect a provider" })).toHaveAttribute(
      "href",
      "/org/acme/integrations",
    );
  });

  it("keeps source filters visible when opened on Provider with no matches", () => {
    renderPage({
      sourceFilter: "external_tms",
      hasActiveFilters: true,
      showNoFilterMatches: true,
      nativeQuery: { isLoading: false, isError: false, isSuccess: false, error: null },
    });

    expect(screen.getByText("Source")).toBeInTheDocument();
    expect(
      screen.getByText((content) =>
        content.includes("No translation memories match your filters."),
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Clear filters" }).length).toBeGreaterThan(0);
  });
});
