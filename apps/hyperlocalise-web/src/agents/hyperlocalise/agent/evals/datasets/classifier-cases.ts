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
import type { ConversationClassification } from "@/lib/agent-runtime/loops/conversation-classifier";

export type ClassifierEvalCase = {
  name: string;
  currentMessage: string;
  conversationText: string;
  hasStoredRepositoryContext: boolean;
  knowledgeMemoryEnabled?: boolean;
  /** Only the flags this case is designed to pin down are asserted. */
  expected: Partial<Omit<ConversationClassification, "confidence">>;
};

/**
 * Labeled routing cases for the pre-turn conversation classifier. Seeded from
 * the examples embedded in buildConversationClassificationPrompt (each of
 * which exists because routing misfired once) plus common non-repo intents.
 * Grow this dataset from real misroutes, not hypotheticals.
 */
export const classifierCases: ClassifierEvalCase[] = [
  {
    name: "explicit-repo-context-lookup",
    currentMessage: "what is the context of 'Email agent' in acme/web?",
    conversationText: "",
    hasStoredRepositoryContext: false,
    expected: {
      needsRepositoryTools: true,
      currentMessageSpecifiesRepository: true,
      requiresPullRequest: false,
    },
  },
  {
    name: "crowdin-progress-question",
    currentMessage: "What's the progress of the HL test project in Crowdin?",
    conversationText: "",
    hasStoredRepositoryContext: false,
    expected: {
      needsRepositoryTools: false,
      requiresPullRequest: false,
    },
  },
  {
    name: "context-lookup-without-repo",
    currentMessage: "do you know the context of Knowledge?",
    conversationText: "",
    hasStoredRepositoryContext: false,
    expected: {
      needsRepositoryTools: true,
      shouldAskForRepositoryClarification: true,
      currentMessageSpecifiesRepository: false,
    },
  },
  {
    name: "memory-md-query-stays-off-repo",
    currentMessage: "what does our Memory.md say about checkout copy?",
    conversationText: "",
    hasStoredRepositoryContext: false,
    knowledgeMemoryEnabled: true,
    expected: {
      needsRepositoryTools: false,
      continuesRepositoryThread: false,
      shouldAskForRepositoryClarification: false,
    },
  },
  {
    name: "memory-md-compare-with-named-repo",
    currentMessage: "compare our Memory.md checkout rules with acme/web",
    conversationText: "",
    hasStoredRepositoryContext: false,
    knowledgeMemoryEnabled: true,
    expected: {
      needsRepositoryTools: true,
      currentMessageSpecifiesRepository: true,
    },
  },
  {
    name: "short-follow-up-continues-repo-thread",
    currentMessage: "show more of the surrounding copy",
    conversationText: [
      "where is the 'Confirm order' string used in acme/storefront?",
      "show more of the surrounding copy",
    ].join("\n"),
    hasStoredRepositoryContext: true,
    expected: {
      needsRepositoryTools: true,
      continuesRepositoryThread: true,
      shouldAskForRepositoryClarification: false,
    },
  },
  {
    name: "plain-translation-request",
    currentMessage: "translate 'Save changes' to German",
    conversationText: "",
    hasStoredRepositoryContext: false,
    expected: {
      needsRepositoryTools: false,
      requiresPullRequest: false,
      shouldAskForRepositoryClarification: false,
    },
  },
  {
    name: "pull-request-review",
    currentMessage:
      "review https://github.com/acme/web/pull/123 for localization issues before we merge",
    conversationText: "",
    hasStoredRepositoryContext: false,
    expected: {
      needsRepositoryTools: true,
      requiresPullRequest: true,
      currentMessageSpecifiesRepository: true,
    },
  },
  {
    name: "which-file-needs-clarification",
    currentMessage: "which file defines the checkout button label?",
    conversationText: "",
    hasStoredRepositoryContext: false,
    expected: {
      needsRepositoryTools: true,
      shouldAskForRepositoryClarification: true,
      currentMessageSpecifiesRepository: false,
    },
  },
  {
    name: "glossary-management-request",
    currentMessage: "add a fr-FR glossary entry for 'workspace' -> 'espace de travail'",
    conversationText: "",
    hasStoredRepositoryContext: false,
    expected: {
      needsRepositoryTools: false,
      requiresPullRequest: false,
    },
  },
  {
    name: "new-topic-drops-stale-repo-thread",
    currentMessage: "what languages should we prioritize for our next market launch?",
    conversationText: [
      "find the 'Add to cart' string in acme/storefront",
      "what languages should we prioritize for our next market launch?",
    ].join("\n"),
    hasStoredRepositoryContext: true,
    expected: {
      needsRepositoryTools: false,
    },
  },
  {
    name: "memory-follow-up-stays-on-memory-task",
    currentMessage: "yes, add that",
    conversationText: [
      "find the 'Add to cart' string in acme/storefront",
      "should we record in Memory.md that checkout copy must use sentence case?",
      "yes, add that",
    ].join("\n"),
    hasStoredRepositoryContext: true,
    knowledgeMemoryEnabled: true,
    expected: {
      needsRepositoryTools: false,
    },
  },
];
