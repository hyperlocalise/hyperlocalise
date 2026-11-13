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
import type { IntlShape } from "@formatjs/intl";

import type { HomepageFaqItem } from "@/components/marketing/homepage-faq-content";

// Inline formatMessage() calls so the catalog extractor picks every string up.
export function formatLocalisationForAiCodingAgentsFaq(intl: IntlShape): {
  heading: string;
  subheading: string;
  items: HomepageFaqItem[];
} {
  return {
    heading: intl.formatMessage({
      defaultMessage: "A few things\nyou might ask.",
      id: "NZvl97UykQ",
      description: "FAQ heading on the localisation-for-ai-coding-agents use case page",
    }),
    subheading: intl.formatMessage({
      defaultMessage: "Localisation from your coding agent.",
      id: "JCxsiAlxGk",
      description: "FAQ subheading on the localisation-for-ai-coding-agents use case page",
    }),
    items: [
      {
        question: intl.formatMessage({
          defaultMessage: "Which agents are supported?",
          id: "GrzwClf/Cc",
          description: "localisation-for-ai-coding-agents use case FAQ question 1",
        }),
        answer: intl.formatMessage({
          defaultMessage:
            "Any client that supports remote MCP servers over HTTP. Claude Code, Codex, and Cursor have setup snippets on your workspace overview.",
          id: "NHbYa+0ivQ",
          description: "localisation-for-ai-coding-agents use case FAQ answer 1",
        }),
      },
      {
        question: intl.formatMessage({
          defaultMessage: "How do I connect?",
          id: "V651Q134xB",
          description: "localisation-for-ai-coding-agents use case FAQ question 2",
        }),
        answer: intl.formatMessage({
          defaultMessage:
            "Add the Hyperlocalise MCP server in your agent, for example with claude mcp add, then approve access in your browser and pick the organization the agent should use.",
          id: "PEEmf4nm6q",
          description: "localisation-for-ai-coding-agents use case FAQ answer 2",
        }),
      },
      {
        question: intl.formatMessage({
          defaultMessage: "What can the agent do?",
          id: "h9UEjFgZPI",
          description: "localisation-for-ai-coding-agents use case FAQ question 3",
        }),
        answer: intl.formatMessage({
          defaultMessage:
            "Read projects, source files, translation keys, and glossaries, check copy against guidelines, start translation jobs, check their status, and see review items.",
          id: "8yDI0FF1Td",
          description: "localisation-for-ai-coding-agents use case FAQ answer 3",
        }),
      },
      {
        question: intl.formatMessage({
          defaultMessage: "Is it safe to give an agent access?",
          id: "AgwjQcVkkf",
          description: "localisation-for-ai-coding-agents use case FAQ question 4",
        }),
        answer: intl.formatMessage({
          defaultMessage:
            "The agent signs in with OAuth and gets a token scoped to one organization and your current role. It cannot do anything your account cannot do.",
          id: "fJelvAjMT1",
          description: "localisation-for-ai-coding-agents use case FAQ answer 4",
        }),
      },
      {
        question: intl.formatMessage({
          defaultMessage: "Does it use our API keys?",
          id: "IDDNmJdcdb",
          description: "localisation-for-ai-coding-agents use case FAQ question 5",
        }),
        answer: intl.formatMessage({
          defaultMessage:
            "No. MCP access uses OAuth, not API keys or personal access tokens, so you do not paste secrets into your agent's config.",
          id: "EGYwL5o+kV",
          description: "localisation-for-ai-coding-agents use case FAQ answer 5",
        }),
      },
      {
        question: intl.formatMessage({
          defaultMessage: "Will the agent change things without asking?",
          id: "AM/nWpO0e2",
          description: "localisation-for-ai-coding-agents use case FAQ question 6",
        }),
        answer: intl.formatMessage({
          defaultMessage:
            "Agents follow your instructions. A good first prompt is to list projects without changing anything, and to review generated output before approving or delivering it.",
          id: "dBIe0N73KS",
          description: "localisation-for-ai-coding-agents use case FAQ answer 6",
        }),
      },
      {
        question: intl.formatMessage({
          defaultMessage: "Do translations skip review?",
          id: "1MbI5KtAzN",
          description: "localisation-for-ai-coding-agents use case FAQ question 7",
        }),
        answer: intl.formatMessage({
          defaultMessage:
            "No. Jobs started by an agent follow the same workflow and review steps as any other job in the project.",
          id: "V74NGTWl34",
          description: "localisation-for-ai-coding-agents use case FAQ answer 7",
        }),
      },
      {
        question: intl.formatMessage({
          defaultMessage: "Who is this for?",
          id: "+SDSeQZZ/b",
          description: "localisation-for-ai-coding-agents use case FAQ question 8",
        }),
        answer: intl.formatMessage({
          defaultMessage:
            "Engineers who build features with an AI coding agent and want translations, glossary checks, and status without leaving the editor.",
          id: "i0uYO4vaHb",
          description: "localisation-for-ai-coding-agents use case FAQ answer 8",
        }),
      },
    ],
  };
}
