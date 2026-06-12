import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import {
  conversationsFixture,
  createStreamedAssistantMessage,
  currentUserFixture,
  messagesFixture,
} from "./inbox.fixture";
import { ConversationMessageList } from "./conversation-message-list";

const meta = {
  title: "App/Inbox/MessageList",
  component: ConversationMessageList,
  parameters: {
    layout: "padded",
  },
  decorators: [
    (Story) => (
      <div className="h-[32rem] w-full max-w-3xl border border-border bg-background">
        <Story />
      </div>
    ),
  ],
  args: {
    conversationId: conversationsFixture[0].id,
    currentUser: currentUserFixture,
    messages: messagesFixture,
    isLoading: false,
    isStreaming: false,
    streamedAssistant: null,
  },
} satisfies Meta<typeof ConversationMessageList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText("Can you localize the hero section for French and German?"),
    ).toBeInTheDocument();
    await expect(
      canvas.getByText(
        "I'll start by extracting the hero strings and creating translation jobs for French and German.",
      ),
    ).toBeInTheDocument();
  },
};

export const Loading: Story = {
  args: {
    messages: [],
    isLoading: true,
  },
};

export const Empty: Story = {
  args: {
    messages: [],
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No messages yet")).toBeInTheDocument();
  },
};

export const Streaming: Story = {
  args: {
    isStreaming: true,
    streamedAssistant: createStreamedAssistantMessage(),
  },
};
