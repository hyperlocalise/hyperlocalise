import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { expect } from "storybook/test";

import { DeleteProjectDialog } from "./delete-project-dialog";
import type { ProjectListRow } from "./project-list";

const sampleProject: ProjectListRow = {
  id: "project_demo",
  name: "Demo Release",
  key: "demo-release",
  description: "Primary website strings",
  descriptionValue: "Primary website strings",
  translationContext: "Use a concise product-marketing tone.",
  translationContextValue: "Use a concise product-marketing tone.",
  created: "Apr 1, 2024, 12:00 PM",
  updated: "Apr 1, 2024, 12:00 PM",
  source: "native",
  externalProviderKind: null,
  externalProjectId: null,
  sourceLocale: "en",
  targetLocales: ["fr", "de"],
  externalProjectUrl: null,
  isActive: true,
  lastSyncedAt: null,
  lastSyncErrorAt: null,
  lastSyncErrorMessage: null,
  openJobCount: 2,
};

const meta = {
  component: DeleteProjectDialog,
  tags: ["ai-generated", "needs-work"],
  args: {
    project: sampleProject,
    isDeleting: false,
    onOpenChange: fn(),
    onDelete: fn(),
  },
} satisfies Meta<typeof DeleteProjectDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("alertdialog")).toHaveTextContent(/demo release/i);
    await expect(canvas.getByRole("button", { name: /^delete$/i })).toBeEnabled();
  },
};

export const Deleting: Story = {
  args: {
    isDeleting: true,
  },
};

export const Closed: Story = {
  args: {
    project: null,
  },
};
