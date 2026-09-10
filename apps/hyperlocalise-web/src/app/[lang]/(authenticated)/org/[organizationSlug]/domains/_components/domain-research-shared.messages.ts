"use client";

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
import { defineMessages } from "react-intl";

export const domainResearchSharedMessages = defineMessages({
  statusVerified: {
    defaultMessage: "Verified",
    id: "Ldg/nc2ZNW",
    description: "Verified linked domain status",
  },
  statusPending: {
    defaultMessage: "Pending verification",
    id: "4Gs0swvUKr",
    description: "Pending linked domain status",
  },
  intentCommercial: {
    defaultMessage: "Commercial",
    id: "1MUKxSsh+U",
    description: "Commercial keyword intent",
  },
  intentInformational: {
    defaultMessage: "Informational",
    id: "Cfwqtf2yZL",
    description: "Informational keyword intent",
  },
  intentTransactional: {
    defaultMessage: "Transactional",
    id: "Ecdn8DbQSv",
    description: "Transactional keyword intent",
  },
  intentNavigational: {
    defaultMessage: "Navigational",
    id: "jtZQ7+L9OR",
    description: "Navigational keyword intent",
  },
  engineChatgpt: {
    defaultMessage: "ChatGPT",
    id: "2DTehBHI2r",
    description: "ChatGPT engine label",
  },
  engineClaude: {
    defaultMessage: "Claude",
    id: "BWMSk9WXT+",
    description: "Claude engine label",
  },
  engineGemini: {
    defaultMessage: "Gemini",
    id: "qMZ6NrKEO8",
    description: "Gemini engine label",
  },
  enginePerplexity: {
    defaultMessage: "Perplexity",
    id: "iRxIH6lG2y",
    description: "Perplexity engine label",
  },
  mentioned: {
    defaultMessage: "Mentioned",
    id: "xaW1VYfh1p",
    description: "Brand mentioned in an AI answer",
  },
  notMentioned: {
    defaultMessage: "Not mentioned",
    id: "23RDpfUwz6",
    description: "Brand missing from an AI answer",
  },
  verifyCta: {
    defaultMessage: "Verify DNS",
    id: "jLf4FX4frG",
    description: "Open the DNS verification dialog",
  },
  pendingTitle: {
    defaultMessage: "Verify this domain to unlock research",
    id: "pWbRWFseNX",
    description: "Empty title when a domain is still pending verification",
  },
  pendingDescription: {
    defaultMessage:
      "Research is scoped to a linked domain and a market. Add the TXT record, then come back to keywords, ranks, and AI mentions.",
    id: "bNgyxWyYAV",
    description: "Empty description when a domain is still pending verification",
  },
  missingTitle: {
    defaultMessage: "Domain not found",
    id: "tbvTBs/44L",
    description: "Title when a linked domain id is unknown",
  },
  missingDescription: {
    defaultMessage: "This domain is not in the workspace catalog.",
    id: "wuTr/wBWSH",
    description: "Description when a linked domain id is unknown",
  },
  backToDomains: {
    defaultMessage: "Back to domains",
    id: "myq8pvTAj1",
    description: "Link back to the domains list from a missing domain",
  },
  emptyTitle: {
    defaultMessage: "Nothing here yet",
    id: "vmnQBcZ7YW",
    description: "Generic empty research title",
  },
  cancel: {
    defaultMessage: "Cancel",
    id: "KagGSv+37S",
    description: "Cancel a domains research dialog",
  },
  copied: {
    defaultMessage: "Copied",
    id: "GX2g34x0MG",
    description: "Clipboard copy confirmation",
  },
});
