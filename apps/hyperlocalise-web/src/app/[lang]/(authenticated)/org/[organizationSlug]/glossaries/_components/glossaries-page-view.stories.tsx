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
    await expect(canvas.getByText("Phrase Term Base")).toBeInTheDocument();
    await expect(canvas.getByText("Crowdin Glossary")).toBeInTheDocument();
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
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("dialog", { name: "Create glossary" })).toBeInTheDocument();
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
