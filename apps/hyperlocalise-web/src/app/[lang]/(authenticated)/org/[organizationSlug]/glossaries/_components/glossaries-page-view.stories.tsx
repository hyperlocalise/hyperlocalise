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
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn } from "storybook/test";

import { createEmptyGlossaryFormFixture, glossariesFixture } from "./glossaries.fixture";
import { GlossariesPageView } from "./glossaries-page-view";

const meta = {
  title: "App/Glossaries/Page",
  component: GlossariesPageView,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    organizationSlug: "acme",
    glossaries: glossariesFixture,
    glossaryTotal: glossariesFixture.length,
    isLoading: false,
    isError: false,
    isSuccess: true,
    error: null,
    allowCreateGlossaries: true,
    hasConnectedProvider: true,
    useLiveProviderGlossaries: false,
    selectedExternalProjectId: "",
    onSelectedExternalProjectIdChange: fn(),
    searchQuery: "",
    onSearchQueryChange: fn(),
    sourceFilter: "all",
    onSourceFilterChange: fn(),
    providerFilter: "all",
    onProviderFilterChange: fn(),
    resourceTypeFilter: "all",
    onResourceTypeFilterChange: fn(),
    syncFilter: "all",
    onSyncFilterChange: fn(),
    providerKinds: ["phrase", "crowdin"],
    hasExternalGlossaries: true,
    hasResourceTypes: true,
    hasActiveFilters: false,
    activeFilterCount: 0,
    onClearFilters: fn(),
    page: 1,
    totalPages: 1,
    pageStart: 1,
    pageEnd: glossariesFixture.length,
    onPageChange: fn(),
    createDialogOpen: false,
    onCreateDialogOpenChange: fn(),
    createForm: createEmptyGlossaryFormFixture(),
    onCreateFormChange: fn(),
    projects: [],
    createErrors: {},
    isCreating: false,
    onSubmitCreateGlossary: fn(),
  },
} satisfies Meta<typeof GlossariesPageView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Glossaries" })).toBeInTheDocument();
    await expect(canvas.getByText("Product UI")).toBeInTheDocument();
    await expect(
      canvas.getByText("American English (en-US), Vietnamese (vi-VN)"),
    ).toBeInTheDocument();
    await expect(canvas.getByText("Phrase Term Base")).toBeInTheDocument();
    await expect(canvas.getByText("Crowdin Glossary")).toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: "Phrase Term Base" })).toHaveAttribute(
      "href",
      "/org/acme/glossaries/22222222-2222-4222-8222-222222222222",
    );
    await expect(canvas.getByRole("link", { name: "Open in provider" })).toHaveAttribute(
      "href",
      "https://phrase.com/tb/42",
    );
  },
};

export const Loading: Story = {
  args: {
    glossaries: [],
    glossaryTotal: 0,
    isLoading: true,
    isSuccess: false,
    pageStart: 0,
    pageEnd: 0,
    providerKinds: [],
    hasExternalGlossaries: false,
    hasResourceTypes: false,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Loading glossaries...")).toBeInTheDocument();
  },
};

export const Empty: Story = {
  args: {
    glossaries: [],
    glossaryTotal: 0,
    pageStart: 0,
    pageEnd: 0,
    providerKinds: [],
    hasExternalGlossaries: false,
    hasResourceTypes: false,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No glossaries yet")).toBeInTheDocument();
    await expect(
      canvas.getByText(
        "Create a workspace glossary, import terms, then assign it to the projects that should use it.",
      ),
    ).toBeInTheDocument();
  },
};

export const NoProviderConnected: Story = {
  args: {
    glossaries: [],
    glossaryTotal: 0,
    allowCreateGlossaries: false,
    hasConnectedProvider: false,
    pageStart: 0,
    pageEnd: 0,
    providerKinds: [],
    hasExternalGlossaries: false,
    hasResourceTypes: false,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Connect a TMS provider")).toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: "Connect a provider" })).toBeInTheDocument();
  },
};

export const ReadOnly: Story = {
  args: {
    allowCreateGlossaries: false,
  },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("button", { name: "Create glossary" })).not.toBeInTheDocument();
  },
};

export const CreateDialogOpen: Story = {
  args: {
    createDialogOpen: true,
    projects: [
      { id: "project-native-1", name: "Product app", sourceLocale: "en-US" },
      { id: "project-native-2", name: "Marketing site", sourceLocale: "en-US" },
    ],
  },
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByRole("dialog", { name: "Create glossary" })).toBeInTheDocument();
    await expect(
      canvas.getByText("Assign glossary to the following projects:"),
    ).toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole("button", { name: "Assign glossary to the following projects:" }),
    );
    await expect(canvas.getByText("Product app")).toBeInTheDocument();
    await expect(canvas.getByText("Marketing site")).toBeInTheDocument();
  },
};

export const LoadError: Story = {
  args: {
    glossaries: [],
    glossaryTotal: 0,
    isError: true,
    isSuccess: false,
    error: new Error("The glossaries API returned a 500."),
    pageStart: 0,
    pageEnd: 0,
    providerKinds: [],
    hasExternalGlossaries: false,
    hasResourceTypes: false,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Glossaries failed to load.")).toBeInTheDocument();
  },
};

export const LiveProjectSelectionRequired: Story = {
  args: {
    glossaries: [],
    glossaryTotal: 0,
    useLiveProviderGlossaries: true,
    allowCreateGlossaries: false,
    pageStart: 0,
    pageEnd: 0,
    providerKinds: [],
    hasExternalGlossaries: false,
    hasResourceTypes: false,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Choose a TMS project")).toBeInTheDocument();
  },
};

export const NoFilterMatches: Story = {
  args: {
    glossaries: [],
    glossaryTotal: 0,
    hasActiveFilters: true,
    activeFilterCount: 1,
    sourceFilter: "native",
    pageStart: 0,
    pageEnd: 0,
    providerKinds: [],
    hasExternalGlossaries: false,
    hasResourceTypes: false,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No glossaries match your filters.")).toBeInTheDocument();
  },
};
