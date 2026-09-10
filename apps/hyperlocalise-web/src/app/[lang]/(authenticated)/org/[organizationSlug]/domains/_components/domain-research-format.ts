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
import type { IntlShape } from "react-intl";

import type {
  BrandEngine,
  DomainResearchStatus,
  KeywordIntent,
} from "@/lib/domains/research-prototype";

import { domainResearchSharedMessages as messages } from "./domain-research-shared.messages";

export function formatDomainStatus(intl: IntlShape, status: DomainResearchStatus) {
  return intl.formatMessage(
    status === "verified" ? messages.statusVerified : messages.statusPending,
  );
}

export function formatKeywordIntent(intl: IntlShape, intent: KeywordIntent) {
  switch (intent) {
    case "commercial":
      return intl.formatMessage(messages.intentCommercial);
    case "informational":
      return intl.formatMessage(messages.intentInformational);
    case "transactional":
      return intl.formatMessage(messages.intentTransactional);
    case "navigational":
      return intl.formatMessage(messages.intentNavigational);
  }
}

export function formatBrandEngine(intl: IntlShape, engine: BrandEngine) {
  switch (engine) {
    case "chatgpt":
      return intl.formatMessage(messages.engineChatgpt);
    case "claude":
      return intl.formatMessage(messages.engineClaude);
    case "gemini":
      return intl.formatMessage(messages.engineGemini);
    case "perplexity":
      return intl.formatMessage(messages.enginePerplexity);
  }
}

export function formatSignedDelta(value: number) {
  if (value === 0) {
    return "0";
  }
  return value > 0 ? `+${value}` : String(value);
}
