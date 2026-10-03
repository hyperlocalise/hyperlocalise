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

import {
  createEmptyMemoryFormFixture,
  translationMemoriesFixture,
} from "./translation-memories.fixture";
import { TranslationMemoriesPageView } from "./translation-memories-page-view";

const nativeMemories = translationMemoriesFixture.filter((memory) => memory.source === "native");
const externalMemories = translationMemoriesFixture.filter(
  (memory) => memory.source === "external_tms",
);

const meta = {
  title: "App/TranslationMemories/Page",
  component: TranslationMemoriesPageView,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    organizationSlug: "acme",
    nativeMemories,
    externalMemories,
    nativeTotal: nativeMemories.length,
    externalTotal: externalMemories.length,
    nativeQuery: { isLoading: false, isError: false, isSuccess: true, error: null },
    externalQuery: { isLoading: false, isError: false, isSuccess: true, error: null },
    allowCreateMemories: true,
    hasConnectedProvider: true,
    useLiveProviderMemories: false,
    selectedExternalProjectId: "",
    onSelectedExternalProjectIdChange: fn(),
    searchQuery: "",
    onSearchQueryChange: fn(),
    hasActiveFilters: false,
    onClearFilters: fn(),
    nativeHasMore: false,
    nativeIsLoadingMore: false,
    onNativeLoadMore: fn(),
    externalHasMore: false,
    externalIsLoadingMore: false,
    onExternalLoadMore: fn(),
    createDialogOpen: false,
    onCreateDialogOpenChange: fn(),
    createForm: createEmptyMemoryFormFixture(),
    onCreateFormChange: fn(),
    createErrors: {},
    isCreating: false,
    onSubmitCreateMemory: fn(),
    onImportMemory: fn(),
  },
} satisfies Meta<typeof TranslationMemoriesPageView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Translation Memories" })).toBeInTheDocument();
    await expect(canvas.getByRole("columnheader", { name: "Name" })).toBeInTheDocument();
    await expect(
      canvas.getByRole("columnheader", { name: "Translation units" }),
    ).toBeInTheDocument();
    await expect(canvas.getByRole("columnheader", { name: "Languages" })).toBeInTheDocument();
    await expect(canvas.getByRole("columnheader", { name: "Projects" })).toBeInTheDocument();
    await expect(canvas.getByText("Workspace memories")).toBeInTheDocument();
    await expect(canvas.getByText("Provider memories")).toBeInTheDocument();
    await expect(canvas.getByText("Product UI")).toBeInTheDocument();
    await expect(canvas.getByText("All")).toBeInTheDocument();
    await expect(canvas.getByText("Phrase TM")).toBeInTheDocument();
    await expect(canvas.getByText("Crowdin Memory")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Import TMX or CSV" })).toBeInTheDocument();
  },
};

export const Loading: Story = {
  args: {
    nativeMemories: [],
    externalMemories: [],
    nativeTotal: 0,
    externalTotal: 0,
    nativeQuery: { isLoading: true, isError: false, isSuccess: false, error: null },
    externalQuery: { isLoading: true, isError: false, isSuccess: false, error: null },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("table", { name: "Translation Memories" })).toBeInTheDocument();
    await expect(canvas.getByText("Workspace memories")).toBeInTheDocument();
    await expect(canvas.getByText("Provider memories")).toBeInTheDocument();
  },
};

export const Empty: Story = {
  args: {
    nativeMemories: [],
    externalMemories: [],
    nativeTotal: 0,
    externalTotal: 0,
    nativeQuery: { isLoading: false, isError: false, isSuccess: true, error: null },
    externalQuery: { isLoading: false, isError: false, isSuccess: true, error: null },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No translation memories yet")).toBeInTheDocument();
    await expect(
      canvas.getByText(
        "Create a workspace memory, upload a TMX or CSV file, then assign it to the projects that should use it.",
      ),
    ).toBeInTheDocument();
    await expect(
      canvas.getAllByRole("button", { name: "Import TMX or CSV" }).length,
    ).toBeGreaterThan(0);
  },
};

export const NoProviderConnected: Story = {
  args: {
    nativeMemories: [],
    externalMemories: [],
    nativeTotal: 0,
    externalTotal: 0,
    allowCreateMemories: false,
    hasConnectedProvider: false,
    nativeQuery: { isLoading: false, isError: false, isSuccess: true, error: null },
    externalQuery: { isLoading: false, isError: false, isSuccess: true, error: null },
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
    await expect(canvas.getByText("Choose a TMX or CSV file")).toBeInTheDocument();
  },
};

export const LoadError: Story = {
  args: {
    nativeMemories: [],
    externalMemories: [],
    nativeTotal: 0,
    externalTotal: 0,
    nativeQuery: {
      isLoading: false,
      isError: true,
      isSuccess: false,
      error: new Error("The translation memories API returned a 500."),
    },
    externalQuery: { isLoading: false, isError: false, isSuccess: true, error: null },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Could not load this group.")).toBeInTheDocument();
    await expect(
      canvas.getByText("The translation memories API returned a 500."),
    ).toBeInTheDocument();
  },
};

export const LiveProjectSelectionRequired: Story = {
  args: {
    nativeMemories: [],
    externalMemories: [],
    nativeTotal: 0,
    externalTotal: 0,
    useLiveProviderMemories: true,
    allowCreateMemories: false,
    nativeQuery: { isLoading: false, isError: false, isSuccess: true, error: null },
    externalQuery: { isLoading: false, isError: false, isSuccess: true, error: null },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Choose a TMS project")).toBeInTheDocument();
  },
};

export const NoFilterMatches: Story = {
  args: {
    nativeMemories: [],
    externalMemories: [],
    nativeTotal: 0,
    externalTotal: 0,
    hasActiveFilters: true,
    nativeQuery: { isLoading: false, isError: false, isSuccess: true, error: null },
    externalQuery: { isLoading: false, isError: false, isSuccess: true, error: null },
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText((content) =>
        content.includes("No translation memories match your filters."),
      ),
    ).toBeInTheDocument();
  },
};

export const LoadMore: Story = {
  args: {
    nativeHasMore: true,
    externalHasMore: true,
  },
  play: async ({ canvas, args, userEvent }) => {
    const loadMoreButtons = canvas.getAllByRole("button", { name: "Load more" });
    await expect(loadMoreButtons).toHaveLength(2);
    await userEvent.click(loadMoreButtons[0]!);
    await expect(args.onNativeLoadMore).toHaveBeenCalledTimes(1);
    await userEvent.click(loadMoreButtons[1]!);
    await expect(args.onExternalLoadMore).toHaveBeenCalledTimes(1);
  },
};
