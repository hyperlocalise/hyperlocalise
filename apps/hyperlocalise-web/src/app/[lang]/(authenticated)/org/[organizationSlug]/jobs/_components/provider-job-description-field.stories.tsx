import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent } from "storybook/test";

import { ProviderJobDescriptionFieldView } from "./provider-job-description-field";

const description = [
  "Translate the product launch page for the spring campaign.",
  "",
  "- Keep product names in English",
  "- Use a friendly, concise tone",
].join("\n");

const meta = {
  title: "App/Jobs/Provider Job Description Field",
  component: ProviderJobDescriptionFieldView,
  render: (args) => (
    <div className="max-w-2xl p-6">
      <ProviderJobDescriptionFieldView {...args} />
    </div>
  ),
} satisfies Meta<typeof ProviderJobDescriptionFieldView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ReadOnlyEmpty: Story = {
  args: {
    description: "",
    editable: false,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No description")).toBeInTheDocument();
  },
};

export const ReadOnlyMarkdown: Story = {
  args: {
    description,
    editable: false,
  },
};

export const EditablePreview: Story = {
  args: {
    description,
    editable: true,
    onSaveDescription: async (nextDescription) => nextDescription,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Edit description" })).toBeInTheDocument();
  },
};

export const EditingDirty: Story = {
  args: {
    description,
    editable: true,
    initialIsEditing: true,
    initialDraft: `${description}\n\nPlease preserve placeholders like {userName}.`,
    onSaveDescription: async (nextDescription) => nextDescription,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Save description" })).toBeEnabled();
  },
};

export const Saving: Story = {
  args: {
    description,
    editable: true,
    initialIsEditing: true,
    initialDraft: `${description}\n\nSaving this revised brief.`,
    isSaving: true,
    onSaveDescription: async (nextDescription) => nextDescription,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Saving…" })).toBeDisabled();
  },
};

export const SaveError: Story = {
  args: {
    description,
    editable: true,
    initialIsEditing: true,
    initialDraft: `${description}\n\nThis save will fail.`,
    onSaveDescription: async () => {
      throw new Error("Crowdin rejected the update.");
    },
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Save description" }));
    await expect(canvas.getByRole("button", { name: "Save description" })).toBeEnabled();
  },
};
