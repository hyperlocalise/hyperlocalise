"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { defineMessages } from "react-intl";

export const glossaryListMessages = defineMessages({
  noDescription: {
    defaultMessage: "No description",
    id: "zEYxUcr2AM",
    description: "Fallback when a glossary has no description",
  },
  noLocalesListed: {
    defaultMessage: "No locales listed",
    id: "u4dBI5XABY",
    description: "Fallback when a glossary has no locale coverage",
  },
  localeCoverageOverflow: {
    defaultMessage: "{locales} +{count}",
    id: "B+FxSZUvzp",
    description:
      "Locale coverage summary showing the first locales plus how many more are not listed",
  },
  unknownTermCount: {
    defaultMessage: "Unknown",
    id: "jy07sgszKV",
    description: "Fallback when a glossary term count is unavailable",
  },
  resourceTypeWorkspaceGlossary: {
    defaultMessage: "Workspace glossary",
    id: "zSrEHMT3CA",
    description: "Resource type badge for native workspace glossaries",
  },
  resourceTypeGlossary: {
    defaultMessage: "Glossary",
    id: "4jL6ZFEZhQ",
    description: "Resource type badge for a glossary resource",
  },
  resourceTypeTermBase: {
    defaultMessage: "Term base",
    id: "QR/HxiItgI",
    description: "Resource type badge for a term base resource",
  },
  capabilityPreferred: {
    defaultMessage: "Preferred",
    id: "/avsY2MZtR",
    description: "Term capability badge part when preferred terms are supported",
  },
  capabilityNoPreferred: {
    defaultMessage: "No preferred",
    id: "HJHu415ivO",
    description: "Term capability badge part when preferred terms are not supported",
  },
  capabilityForbidden: {
    defaultMessage: "Forbidden",
    id: "PT4ucYt9VV",
    description: "Term capability badge part when forbidden terms are supported",
  },
  capabilityNoForbidden: {
    defaultMessage: "No forbidden",
    id: "Xx/womTY6W",
    description: "Term capability badge part when forbidden terms are not supported",
  },
  capabilityUnknown: {
    defaultMessage: "Capabilities unknown",
    id: "cKwH9F0Z5s",
    description: "Term capability badge when provider capabilities are unknown",
  },
  capabilityReadOnly: {
    defaultMessage: "Read-only",
    id: "uf1YHYgy0L",
    description: "Capability badge for live provider glossaries that cannot be edited",
  },
  unavailableTimestamp: {
    defaultMessage: "—",
    id: "kxi2ohyZnf",
    description: "Placeholder when a glossary timestamp is unavailable",
  },
});
