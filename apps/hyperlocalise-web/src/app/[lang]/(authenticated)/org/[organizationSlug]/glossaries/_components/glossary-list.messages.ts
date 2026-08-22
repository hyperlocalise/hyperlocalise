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
  unavailableTimestamp: {
    defaultMessage: "—",
    id: "kxi2ohyZnf",
    description: "Placeholder when a glossary timestamp is unavailable",
  },
});
