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
import { expect, fn, userEvent, within } from "storybook/test";

import type { DictionaryListRow } from "./dictionary-list";
import { DictionariesPageView } from "./dictionaries-page-view";

function createDictionary(overrides: Partial<DictionaryListRow> = {}): DictionaryListRow {
  return {
    id: "dict_001",
    name: "Product names",
    description: "Brand and feature names that should never be flagged as misspelled.",
    status: "active",
    wordsVersion: 3,
    wordCount: 128,
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-11-20T00:00:00.000Z",
    ...overrides,
  };
}

const dictionaries: DictionaryListRow[] = [
  createDictionary(),
  createDictionary({
    id: "dict_002",
    name: "Medical terminology",
    description: "Approved clinical terms for the patient app in German and French.",
    wordCount: 2_430,
  }),
  createDictionary({
    id: "dict_003",
    name: "Legacy campaign slang",
    description: "",
    status: "archived",
    wordCount: 12,
  }),
];

const meta = {
  title: "App/Dictionaries/Page",
  component: DictionariesPageView,
  parameters: {
    layout: "fullscreen",
    nextjs: {
      appDirectory: true,
      navigation: { pathname: "/org/acme/dictionaries" },
    },
  },
  args: {
    organizationSlug: "acme",
    dictionaries,
    isLoading: false,
    isError: false,
    isSuccess: true,
    error: null,
    canWriteDictionaries: true,
    searchQuery: "",
    onSearchQueryChange: fn(),
    createDialogOpen: false,
    onCreateDialogOpenChange: fn(),
    createForm: { name: "", description: "" },
    onCreateFormChange: fn(),
    createErrors: {},
    isCreating: false,
    onSubmitCreateDictionary: fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
    onLoadMore: fn(),
    totalCount: dictionaries.length,
  },
} satisfies Meta<typeof DictionariesPageView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Medical terminology")).toBeVisible();
    await userEvent.click(canvas.getAllByRole("button", { name: /create dictionary/i })[0]);
    await expect(args.onCreateDialogOpenChange).toHaveBeenCalledWith(true);
  },
};

export const Loading: Story = {
  args: { dictionaries: [], isLoading: true, isSuccess: false, totalCount: undefined },
};

export const LoadError: Story = {
  args: {
    dictionaries: [],
    isError: true,
    isSuccess: false,
    error: new Error("Failed to load dictionaries"),
  },
};

export const FirstRun: Story = {
  args: { dictionaries: [], totalCount: 0 },
};

export const EmptyReadOnly: Story = {
  args: { dictionaries: [], totalCount: 0, canWriteDictionaries: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.queryByRole("button", { name: /create dictionary/i }),
    ).not.toBeInTheDocument();
  },
};

export const NoSearchMatches: Story = {
  args: { dictionaries: [], searchQuery: "zzz", totalCount: 3 },
};

export const MorePages: Story = {
  args: { hasNextPage: true, totalCount: 42 },
};

export const CreateDialog: Story = {
  args: {
    createDialogOpen: true,
    createForm: { name: "Product names", description: "" },
  },
};

export const CreateDialogWithErrors: Story = {
  args: {
    createDialogOpen: true,
    createForm: { name: "", description: "Terms for the spring launch." },
    createErrors: {
      name: "Enter a name for the dictionary.",
      submit: "We couldn't create the dictionary. Try again.",
    },
  },
};

export const Creating: Story = {
  args: {
    createDialogOpen: true,
    createForm: { name: "Product names", description: "" },
    isCreating: true,
  },
};
