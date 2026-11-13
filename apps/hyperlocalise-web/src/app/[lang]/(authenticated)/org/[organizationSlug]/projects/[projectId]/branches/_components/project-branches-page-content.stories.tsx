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

import {
  projectBranchesFeatureFixture,
  projectBranchesFixture,
  projectBranchesMainFixture,
  projectBranchesProtectedFixture,
  projectBranchesWithHistoryFixture,
} from "./project-branches.fixture";
import { ProjectBranchesPageContentView } from "./project-branches-page-content-view";

const noop = () => undefined;

const meta = {
  title: "App/Project/Branches/Page",
  component: ProjectBranchesPageContentView,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    canManage: true,
    isProviderProject: false,
    isLoading: false,
    isError: false,
    branches: projectBranchesFixture,
    name: "",
    title: "",
    baseBranchName: "main",
    onNameChange: noop,
    onTitleChange: noop,
    onBaseBranchNameChange: noop,
    onCreate: noop,
    isCreating: false,
    onProtectChange: noop,
    onSync: noop,
    isSyncing: false,
    onDelete: noop,
    isDeleting: false,
    mergeBranch: null,
    mergeStrategy: "use_base",
    onMergeStrategyChange: noop,
    onOpenMerge: noop,
    onCloseMerge: noop,
    onConfirmMerge: noop,
    isMerging: false,
    isMergePreviewLoading: false,
    previewCounts: { added: 0, changed: 0, conflicted: 0 },
  },
} satisfies Meta<typeof ProjectBranchesPageContentView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Branches" })).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Create branch" })).toBeInTheDocument();
    await expect(canvas.getByText("Default")).toBeInTheDocument();
    await expect(canvas.getByText("Checkout")).toBeInTheDocument();
    await expect(canvas.getByText("feature-checkout")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Sync" })).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Merge" })).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  },
};

export const Protected: Story = {
  args: {
    branches: [projectBranchesMainFixture, projectBranchesProtectedFixture],
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Protected")).toBeInTheDocument();
    await expect(canvas.getAllByText("Protect").length).toBeGreaterThan(0);
  },
};

export const MergedHistory: Story = {
  args: {
    branches: projectBranchesWithHistoryFixture,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Merged")).toBeInTheDocument();
    await expect(canvas.getByText("iOS release")).toBeInTheDocument();
    await expect(canvas.getByText("release-ios")).toBeInTheDocument();
    await expect(canvas.getAllByRole("button", { name: "Sync" })).toHaveLength(1);
    await expect(canvas.getAllByRole("button", { name: "Delete" })).toHaveLength(1);
  },
};

export const MergeDialog: Story = {
  args: {
    mergeBranch: projectBranchesFeatureFixture,
    previewCounts: { added: 2, changed: 3, conflicted: 1 },
  },
  play: async () => {
    const dialog = await within(document.body).findByRole("dialog", {
      name: "Merge feature-checkout",
    });
    const inDialog = within(dialog);
    await expect(inDialog.getByText(/2 added/)).toBeInTheDocument();
    await expect(inDialog.getByText(/3 changed/)).toBeInTheDocument();
    await expect(inDialog.getByText(/1 conflicted/)).toBeInTheDocument();
    await expect(inDialog.getByRole("button", { name: "Merge branch" })).toBeEnabled();
    await expect(inDialog.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  },
};

export const MergeDialogLoading: Story = {
  args: {
    mergeBranch: projectBranchesFeatureFixture,
    isMergePreviewLoading: true,
  },
};

export const ReadOnly: Story = {
  args: {
    canManage: false,
  },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("button", { name: "Create branch" })).not.toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "Sync" })).not.toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "Merge" })).not.toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
    await expect(canvas.queryByText("Protect")).not.toBeInTheDocument();
    await expect(canvas.getByText("Checkout")).toBeInTheDocument();
  },
};

export const ConnectedTmsUnavailable: Story = {
  args: {
    isProviderProject: true,
    branches: [],
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText("Version branches are available on native projects."),
    ).toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "Create branch" })).not.toBeInTheDocument();
  },
};

export const Loading: Story = {
  args: {
    isLoading: true,
    branches: [],
  },
};

export const Empty: Story = {
  args: {
    branches: [],
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("This project has no version branches yet.")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Create branch" })).toBeDisabled();
  },
};

export const LoadError: Story = {
  args: {
    isError: true,
    errorMessage: "The branches API returned a 500.",
    branches: [],
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("The branches API returned a 500.")).toBeInTheDocument();
  },
};

export const OpenMergeFromRow: Story = {
  args: {
    onOpenMerge: fn(),
  },
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Merge" }));
    await expect(args.onOpenMerge).toHaveBeenCalledWith(projectBranchesFeatureFixture);
  },
};
