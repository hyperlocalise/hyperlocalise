import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn } from "storybook/test";

import {
  conversationsFixture,
  createConversation,
  createStreamedAssistantMessage,
  currentUserFixture,
  linkedJobsFixture,
  messagesFixture,
} from "./inbox.fixture";
import { InboxPageView } from "./inbox-page-view";

const meta = {
  title: "App/Inbox/Page",
  component: InboxPageView,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    organizationSlug: "acme",
    currentUser: currentUserFixture,
    conversations: conversationsFixture,
    conversationsIsLoading: false,
    conversationsIsError: false,
    selectedConversationId: conversationsFixture[0].id,
    selectedConversation: conversationsFixture[0],
    messages: messagesFixture,
    messagesIsLoading: false,
    jobs: linkedJobsFixture,
    jobsIsLoading: false,
    isSending: false,
    isStreaming: false,
    isSparseInbox: false,
    streamedAssistant: null,
    onSelectConversation: fn(),
    onSendMessage: fn(),
  },
} satisfies Meta<typeof InboxPageView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Translate homepage hero copy")).toBeInTheDocument();
    await expect(
      canvas.getByText("Can you localize the hero section for French and German?"),
    ).toBeInTheDocument();
  },
};

export const LoadingConversations: Story = {
  args: {
    conversations: [],
    selectedConversationId: "",
    selectedConversation: undefined,
    messages: [],
    jobs: [],
    conversationsIsLoading: true,
    messagesIsLoading: true,
    jobsIsLoading: true,
  },
};

export const EmptyInbox: Story = {
  args: {
    conversations: [],
    selectedConversationId: "",
    selectedConversation: undefined,
    messages: [],
    jobs: [],
    isSparseInbox: true,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No conversations yet.")).toBeInTheDocument();
    await expect(canvas.getByText("Select a conversation to view details")).toBeInTheDocument();
  },
};

export const ConversationsLoadError: Story = {
  args: {
    conversations: [],
    selectedConversationId: "",
    selectedConversation: undefined,
    messages: [],
    jobs: [],
    conversationsIsError: true,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Unable to load conversations.")).toBeInTheDocument();
  },
};

export const SparseInbox: Story = {
  args: {
    conversations: [conversationsFixture[0]],
    isSparseInbox: true,
  },
};

export const StreamingResponse: Story = {
  args: {
    isStreaming: true,
    streamedAssistant: createStreamedAssistantMessage(),
  },
};

export const EmailConversation: Story = {
  args: {
    selectedConversationId: conversationsFixture[1].id,
    selectedConversation: conversationsFixture[1],
    messages: [],
    jobs: [],
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Email: Q3 release notes")).toBeInTheDocument();
    await expect(
      canvas.queryByPlaceholderText("Paste text or describe what to translate..."),
    ).not.toBeInTheDocument();
  },
};

export const ArchivedConversation: Story = {
  args: {
    selectedConversationId: conversationsFixture[2].id,
    selectedConversation: conversationsFixture[2],
    messages: [
      {
        id: "msg_archived",
        conversationId: conversationsFixture[2].id,
        senderType: "agent",
        senderEmail: null,
        text: "Opened a PR with updated checkout copy.",
        attachments: null,
        createdAt: conversationsFixture[2].lastMessageAt,
      },
    ],
    jobs: [],
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("archived")).toBeInTheDocument();
  },
};

export const SendingMessage: Story = {
  args: {
    isSending: true,
    selectedConversation: createConversation({ source: "chat_ui" }),
  },
};
