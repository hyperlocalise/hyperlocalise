import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn } from "storybook/test";

import {
  createEmptyMemoryFormFixture,
  translationMemoriesFixture,
} from "./translation-memories.fixture";
import { TranslationMemoriesPageView } from "./translation-memories-page-view";

const meta = {
  title: "App/TranslationMemories/Page",
  component: TranslationMemoriesPageView,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    organizationSlug: "acme",
    memories: translationMemoriesFixture,
    memoryTotal: translationMemoriesFixture.length,
    isLoading: false,
    isError: false,
    isSuccess: true,
    error: null,
    allowCreateMemories: true,
    hasConnectedProvider: true,
    useLiveProviderMemories: false,
    selectedExternalProjectId: "",
    onSelectedExternalProjectIdChange: fn(),
    searchQuery: "",
    onSearchQueryChange: fn(),
    sourceFilter: "all",
    onSourceFilterChange: fn(),
    providerFilter: "all",
    onProviderFilterChange: fn(),
    syncFilter: "all",
    onSyncFilterChange: fn(),
    providerKinds: ["phrase", "crowdin"],
    hasExternalMemories: true,
    hasMemories: true,
    activeFilterCount: 0,
    showNoFilterMatches: false,
    onClearFilters: fn(),
    page: 1,
    totalPages: 1,
    pageStart: 1,
    pageEnd: translationMemoriesFixture.length,
    onPageChange: fn(),
    createDialogOpen: false,
    onCreateDialogOpenChange: fn(),
    createForm: createEmptyMemoryFormFixture(),
    onCreateFormChange: fn(),
    createErrors: {},
    isCreating: false,
    onSubmitCreateMemory: fn(),
  },
} satisfies Meta<typeof TranslationMemoriesPageView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Translation Memories" })).toBeInTheDocument();
    await expect(canvas.getByText("Product UI")).toBeInTheDocument();
    await expect(canvas.getByText("Phrase TM")).toBeInTheDocument();
    await expect(canvas.getByText("Crowdin Memory")).toBeInTheDocument();
  },
};

export const Loading: Story = {
  args: {
    memories: [],
    memoryTotal: 0,
    isLoading: true,
    isSuccess: false,
    pageStart: 0,
    pageEnd: 0,
    providerKinds: [],
    hasExternalMemories: false,
    hasMemories: false,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Loading translation memories...")).toBeInTheDocument();
  },
};

export const Empty: Story = {
  args: {
    memories: [],
    memoryTotal: 0,
    pageStart: 0,
    pageEnd: 0,
    providerKinds: [],
    hasExternalMemories: false,
    hasMemories: false,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No translation memories yet")).toBeInTheDocument();
    await expect(
      canvas.getByText(
        "Create a workspace memory, import entries, then assign it to the projects that should use it.",
      ),
    ).toBeInTheDocument();
  },
};

export const NoProviderConnected: Story = {
  args: {
    memories: [],
    memoryTotal: 0,
    allowCreateMemories: false,
    hasConnectedProvider: false,
    pageStart: 0,
    pageEnd: 0,
    providerKinds: [],
    hasExternalMemories: false,
    hasMemories: false,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Connect a TMS provider")).toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: "Connect a provider" })).toBeInTheDocument();
  },
};

export const ReadOnly: Story = {
  args: {
    allowCreateMemories: false,
  },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("button", { name: "Create memory" })).not.toBeInTheDocument();
  },
};

export const CreateDialogOpen: Story = {
  args: {
    createDialogOpen: true,
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("dialog", { name: "Create translation memory" }),
    ).toBeInTheDocument();
  },
};

export const LoadError: Story = {
  args: {
    memories: [],
    memoryTotal: 0,
    isError: true,
    isSuccess: false,
    error: new Error("The translation memories API returned a 500."),
    pageStart: 0,
    pageEnd: 0,
    providerKinds: [],
    hasExternalMemories: false,
    hasMemories: false,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Translation memories failed to load.")).toBeInTheDocument();
  },
};

export const LiveProjectSelectionRequired: Story = {
  args: {
    memories: [],
    memoryTotal: 0,
    useLiveProviderMemories: true,
    allowCreateMemories: false,
    pageStart: 0,
    pageEnd: 0,
    providerKinds: [],
    hasExternalMemories: false,
    hasMemories: false,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Choose a TMS project")).toBeInTheDocument();
  },
};

export const NoFilterMatches: Story = {
  args: {
    memories: [],
    showNoFilterMatches: true,
    hasMemories: true,
    activeFilterCount: 1,
    sourceFilter: "native",
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText("No translation memories match your filters."),
    ).toBeInTheDocument();
  },
};
