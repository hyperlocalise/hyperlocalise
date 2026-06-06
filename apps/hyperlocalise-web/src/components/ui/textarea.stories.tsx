import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { Textarea } from "./textarea";

const meta = {
  title: "UI/Textarea",
  component: Textarea,
} satisfies Meta<typeof Textarea>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  render: () => (
    <div className="flex max-w-md flex-col gap-4 p-6">
      <Textarea
        aria-label="Translation instructions"
        placeholder="Keep product names untranslated."
      />
      <Textarea
        aria-label="Reviewer note"
        defaultValue="Check placeholders before approving these translations."
      />
      <Textarea aria-invalid aria-label="Glossary note" defaultValue="Missing locale guidance." />
    </div>
  ),
  play: async ({ canvas, userEvent }) => {
    const textarea = canvas.getByLabelText("Translation instructions");
    await userEvent.type(textarea, "Use a concise, neutral tone.");
    await expect(textarea).toHaveValue("Use a concise, neutral tone.");
  },
};
