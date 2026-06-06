import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "./accordion";

const meta = {
  title: "UI/Accordion",
  component: Accordion,
} satisfies Meta<typeof Accordion>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  render: () => (
    <Accordion className="max-w-xl" defaultValue={["provider"]}>
      <AccordionItem value="provider">
        <AccordionTrigger>Provider setup</AccordionTrigger>
        <AccordionContent>
          Connect Phrase, Lokalise, or GitHub before syncing strings.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="review">
        <AccordionTrigger>Review workflow</AccordionTrigger>
        <AccordionContent>
          Invite reviewers to approve locale updates before release.
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Provider setup")).toBeInTheDocument();
  },
};
