import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { conversationsFixture, linkedJobsFixture } from "./inbox.fixture";
import { ConversationDetails } from "./conversation-details";

const meta = {
  title: "App/Inbox/ConversationDetails",
  component: ConversationDetails,
  parameters: {
    layout: "padded",
  },
  decorators: [
    (Story) => (
      <div className="w-72 rounded-xl border border-border bg-card p-4">
        <Story />
      </div>
    ),
  ],
  args: {
    organizationSlug: "acme",
    conversation: conversationsFixture[0],
    jobs: linkedJobsFixture,
    jobsIsLoading: false,
  },
} satisfies Meta<typeof ConversationDetails>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Conversation details")).toBeInTheDocument();
    await expect(canvas.getByText("Linked jobs")).toBeInTheDocument();
    await expect(canvas.getByText("job_translate_homepage")).toBeInTheDocument();
  },
};

export const LoadingJobs: Story = {
  args: {
    jobs: [],
    jobsIsLoading: true,
  },
};

export const NoLinkedJobs: Story = {
  args: {
    jobs: [],
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("None linked")).toBeInTheDocument();
  },
};

export const EmailConversation: Story = {
  args: {
    conversation: conversationsFixture[1],
    jobs: [],
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Email")).toBeInTheDocument();
  },
};
