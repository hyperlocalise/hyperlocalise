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
import type { UIMessage } from "ai";

import type { InboxGithubRepository } from "./inbox-api";
import type { InboxIssueNotification } from "./inbox-notifications-api";
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

export function createGithubRepository(
  overrides: Partial<InboxGithubRepository> = {},
): InboxGithubRepository {
  return {
    id: "repo_website",
    githubRepositoryId: "101",
    owner: "hyperlocalise",
    name: "hyperlocalise-web",
    fullName: "hyperlocalise/hyperlocalise-web",
    archived: false,
    defaultBranch: "main",
    enabled: true,
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

export const repositoriesFixture: InboxGithubRepository[] = [
  createGithubRepository(),
  createGithubRepository({
    id: "repo_mobile",
    githubRepositoryId: "102",
    name: "mobile-app",
    fullName: "hyperlocalise/mobile-app",
  }),
];

export function createInboxIssueNotification(
  overrides: Partial<InboxIssueNotification> = {},
): InboxIssueNotification {
  return {
    id: "notification_assigned_001",
    organizationId: "org_acme",
    projectId: "project_website",
    issueId: "issue_001",
    type: "assigned",
    payload: {
      issueTitle: "Source string needs context",
      projectId: "project_website",
    },
    actor: {
      userId: "user_otto",
      displayName: "Otto Klein",
      email: "otto@example.com",
      avatarUrl: null,
    },
    readAt: null,
    createdAt: iso(-900_000),
    ...overrides,
  };
}

export const issueNotificationsFixture: InboxIssueNotification[] = [
  createInboxIssueNotification(),
  createInboxIssueNotification({
    id: "notification_mention_001",
    type: "mentioned",
    payload: {
      issueTitle: "Checkout CTA tone feels off",
      projectId: "project_website",
      commentId: "comment_001",
      commentExcerpt: "Can you review the CTA wording?",
    },
    actor: {
      userId: "user_mina",
      displayName: "Mina Chen",
      email: "mina@example.com",
      avatarUrl: null,
    },
    readAt: null,
    createdAt: iso(-1_200_000),
  }),
  createInboxIssueNotification({
    id: "notification_comment_001",
    type: "comment",
    payload: {
      issueTitle: "Source string needs context",
      projectId: "project_website",
      commentId: "comment_002",
      commentExcerpt: "Added a screenshot from the checkout flow.",
    },
    actor: {
      userId: "user_aiko",
      displayName: "Aiko Tanaka",
      email: "aiko@example.com",
      avatarUrl: null,
    },
    readAt: iso(-600_000),
    createdAt: iso(-3_600_000),
  }),
  createInboxIssueNotification({
    id: "notification_status_001",
    type: "status_changed",
    payload: {
      issueTitle: "Glossary term mismatch",
      projectId: "project_website",
      previousStatus: "open",
      nextStatus: "in_progress",
    },
    actor: {
      userId: "user_otto",
      displayName: "Otto Klein",
      email: "otto@example.com",
      avatarUrl: null,
    },
    readAt: iso(-3_000_000),
    createdAt: iso(-7_200_000),
  }),
];
