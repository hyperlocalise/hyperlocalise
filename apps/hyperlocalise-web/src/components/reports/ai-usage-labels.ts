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
"use client";

import type { IntlShape } from "react-intl";

import {
  aiOrigin,
  type AiChannel,
  type AiKeyType,
  type AiOrigin,
  type AiUsageDimension,
} from "@/lib/reporting/ai-usage-origins";

import { aiUsageTabMessages as messages } from "./ai-usage-tab.messages";

/** What AI usage's details and their values are called on the page. */

type Intl = IntlShape;
type Group = { key: string | null; label: string | null };

export function dimensionLabel(intl: Intl, dimension: AiUsageDimension) {
  return intl.formatMessage(messages[`ai_dimension_${dimension}`]);
}

export function originLabel(intl: Intl, origin: AiOrigin) {
  return intl.formatMessage(messages[`origin_${origin}`]);
}

export function channelLabel(intl: Intl, channel: AiChannel) {
  return intl.formatMessage(messages[`channel_${channel}`]);
}

export function keyTypeLabel(intl: Intl, key: AiKeyType) {
  return intl.formatMessage(messages[`key_${key}`]);
}

/** A feature's plain name; one without a name shows its area and billing's name for it. */
export function featureLabel(intl: Intl, source: string) {
  const message = (messages as Record<string, (typeof messages)["feature_chat_agent_turn"]>)[
    `feature_${source}`
  ];
  if (message) return intl.formatMessage(message);
  return intl.formatMessage(messages.featureUnknown, {
    area: originLabel(intl, aiOrigin(source)),
    name: source,
  });
}

/** What a group of a detail is called on the page. */
export function aiGroupLabel(intl: Intl, dimension: AiUsageDimension, group: Group) {
  if (group.key === null) {
    if (dimension === "project") return intl.formatMessage(messages.outsideProjects);
    if (dimension === "task") return intl.formatMessage(messages.noTask);
    if (dimension === "automation") return intl.formatMessage(messages.noAutomation);
    return intl.formatMessage(messages.noneGroup);
  }
  switch (dimension) {
    case "area":
      return originLabel(intl, group.key as AiOrigin);
    case "channel":
      return channelLabel(intl, group.key as AiChannel);
    case "key":
      return keyTypeLabel(intl, group.key as AiKeyType);
    case "feature":
      return featureLabel(intl, group.key);
    default:
      return group.label ?? group.key;
  }
}
