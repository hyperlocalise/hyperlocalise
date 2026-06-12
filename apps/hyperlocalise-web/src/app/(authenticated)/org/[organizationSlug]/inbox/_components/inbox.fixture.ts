import type { UIMessage } from "ai";

import type { InboxProjectSummary } from "./inbox-api";
import type {
  Conversation,
  ConversationMessage,
  InboxCurrentUser,
  LinkedJob,
  StreamedAssistantMessage,
} from "./inbox-types";

const fixedNow = "2026-06-07T12:00:00.000Z";

function iso(offsetMs: number) {
  return new Date(Date.parse(fixedNow) + offsetMs).toISOString();
}

export function createCurrentUser(overrides: Partial<InboxCurrentUser> = {}): InboxCurrentUser {
  return {
    avatarUrl: null,
    email: "mina@example.com",
    name: "Mina Chen",
    ...overrides,
  };
}

export function createConversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    title: "Translate homepage hero copy",
    source: "chat_ui",
    status: "active",
    projectId: "project_website",
    lastMessageAt: iso(-1_800_000),
    createdAt: iso(-86_400_000),
    participantEmail: "mina@example.com",
    lastMessage: {
      text: "Can you localize the hero section for French and German?",
      senderType: "user",
      createdAt: iso(-1_800_000),
    },
    ...overrides,
  };
}

export function createConversationMessage(
  overrides: Partial<ConversationMessage> = {},
): ConversationMessage {
  return {
    id: "msg_001",
    conversationId: "11111111-1111-4111-8111-111111111111",
    senderType: "user",
    senderEmail: "mina@example.com",
    text: "Can you localize the hero section for French and German?",
    attachments: null,
    createdAt: iso(-1_800_000),
    ...overrides,
  };
}

export function createLinkedJob(overrides: Partial<LinkedJob> = {}): LinkedJob {
  return {
    id: "job_translate_homepage",
    projectId: "project_website",
    kind: "translation",
    type: "file",
    status: "running",
    outcomeKind: null,
    createdAt: iso(-3_600_000),
    completedAt: null,
    ...overrides,
  };
}

export function createProjectSummary(
  overrides: Partial<InboxProjectSummary> = {},
): InboxProjectSummary {
  return {
    id: "project_website",
    organizationId: "org_001",
    teamId: null,
    createdByUserId: "user_001",
    name: "Website",
    description: "Marketing website localization",
    translationContext: "Public marketing copy",
    source: "native",
    externalProviderKind: null,
    externalProjectId: null,
    sourceLocale: "en-US",
    targetLocales: ["fr-FR", "de-DE"],
    externalProjectUrl: null,
    isActive: true,
    lastSyncedAt: null,
    lastSyncErrorAt: null,
    lastSyncErrorMessage: null,
    createdAt: iso(-604_800_000),
    updatedAt: iso(-86_400_000),
    openJobCount: 2,
    ...overrides,
  };
}

export function createStreamedAssistantMessage(
  overrides: Partial<StreamedAssistantMessage> = {},
): StreamedAssistantMessage {
  const message: UIMessage = {
    id: "stream-msg_001",
    role: "assistant",
    parts: [
      {
        type: "text",
        text: "I can help translate the hero section. I'll create translation jobs for French and German.",
        state: "done",
      },
    ],
  };

  return {
    conversationId: "11111111-1111-4111-8111-111111111111",
    responseToMessageId: "msg_001",
    message,
    status: "streaming",
    ...overrides,
  };
}

export const currentUserFixture = createCurrentUser();

export const conversationsFixture: Conversation[] = [
  createConversation(),
  createConversation({
    id: "22222222-2222-4222-8222-222222222222",
    title: "Email: Q3 release notes",
    source: "email_agent",
    participantEmail: "partner@example.com",
    lastMessage: {
      text: "Please review the attached release notes draft.",
      senderType: "user",
      createdAt: iso(-7_200_000),
    },
    lastMessageAt: iso(-7_200_000),
    createdAt: iso(-172_800_000),
    projectId: null,
  }),
  createConversation({
    id: "33333333-3333-4333-8333-333333333333",
    title: "GitHub: checkout strings",
    source: "github_agent",
    status: "archived",
    participantEmail: "dev@example.com",
    lastMessage: {
      text: "Opened a PR with updated checkout copy.",
      senderType: "agent",
      createdAt: iso(-259_200_000),
    },
    lastMessageAt: iso(-259_200_000),
    createdAt: iso(-432_000_000),
    projectId: "project_mobile",
  }),
];

export const messagesFixture: ConversationMessage[] = [
  createConversationMessage(),
  createConversationMessage({
    id: "msg_002",
    senderType: "agent",
    senderEmail: null,
    text: "I'll start by extracting the hero strings and creating translation jobs for French and German.",
    createdAt: iso(-1_500_000),
  }),
];

export const linkedJobsFixture: LinkedJob[] = [
  createLinkedJob(),
  createLinkedJob({
    id: "job_review_hero",
    kind: "review",
    type: null,
    status: "waiting_for_review",
    createdAt: iso(-1_200_000),
  }),
];

export const projectsFixture: InboxProjectSummary[] = [
  createProjectSummary(),
  createProjectSummary({
    id: "project_mobile",
    name: "Mobile app",
  }),
];
