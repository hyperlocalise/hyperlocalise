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

export const memoryListMessages = defineMessages({
  noDescription: {
    defaultMessage: "No description",
    id: "kupHE+YuT1",
    description: "Fallback when a translation memory has no description",
  },
  noLocalesListed: {
    defaultMessage: "No locales listed",
    id: "k7+7pXhrLD",
    description: "Fallback when a translation memory has no locale coverage",
  },
  localeCoverageOverflow: {
    defaultMessage: "{locales} +{count}",
    id: "B+FxSZUvzp",
    description:
      "Locale coverage summary showing the first locales plus how many more are not listed",
  },
  unknownSegmentCount: {
    defaultMessage: "Unknown",
    id: "dHB1MtjiIw",
    description: "Fallback when a translation memory segment count is unavailable",
  },
  capabilityLiveSearch: {
    defaultMessage: "Live search",
    id: "x+tic2aBLP",
    description: "Capability badge for translation memories that support live search",
  },
  capabilitySyncedImport: {
    defaultMessage: "Synced import",
    id: "haASfbpIl3",
    description: "Capability badge for translation memories imported via sync",
  },
  capabilityReferenceOnly: {
    defaultMessage: "Reference only",
    id: "+1iKu+aEDX",
    description: "Capability badge for reference-only translation memories",
  },
  capabilityWorkspaceManaged: {
    defaultMessage: "Workspace managed",
    id: "uVpYHu+SN7",
    description: "Capability badge for native workspace translation memories",
  },
  capabilityProviderManaged: {
    defaultMessage: "Provider managed",
    id: "w/AfF5+Bk0",
    description: "Capability badge for provider-managed translation memories",
  },
  capabilityReadOnly: {
    defaultMessage: "Read-only",
    id: "VvwPsdoDVF",
    description: "Capability badge for live provider translation memories that cannot be edited",
  },
  unavailableTimestamp: {
    defaultMessage: "—",
    id: "SKXgzqqNy+",
    description: "Placeholder when a translation memory timestamp is unavailable",
  },
});
