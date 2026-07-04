import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { expect } from "storybook/test";

import { ProjectFilesBranchFilterView } from "./project-files-branch-filter-view";
import { providerProjectBranchesFixture } from "./project-files.fixture";

const meta = {
  title: "App/Project/Files/Branch Filter",
  component: ProjectFilesBranchFilterView,
  parameters: {
    layout: "padded",
  },
  args: {
    branches: providerProjectBranchesFixture,
    selectedBranch: null,
    onSelectedBranchChange: () => undefined,
    isLoading: false,
  },
} satisfies Meta<typeof ProjectFilesBranchFilterView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllBranches: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Branch")).toBeInTheDocument();
    await expect(canvas.getByRole("combobox")).toHaveTextContent("All branches");
  },
};

export const BranchSelected: Story = {
  render: (args) => {
    const [selectedBranch, setSelectedBranch] = useState<string | null>("feature-checkout");

    return (
      <ProjectFilesBranchFilterView
        {...args}
        selectedBranch={selectedBranch}
        onSelectedBranchChange={setSelectedBranch}
      />
    );
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("combobox")).toHaveTextContent(
      "Feature checkout (feature-checkout)",
    );
  },
};

export const Loading: Story = {
  args: {
    branches: [],
    isLoading: true,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Loading branches…")).toBeInTheDocument();
  },
};

export const HiddenWhenEmpty: Story = {
  args: {
    branches: [],
    isLoading: false,
  },
  play: async ({ canvas }) => {
    await expect(canvas.queryByText("Branch")).not.toBeInTheDocument();
  },
};
