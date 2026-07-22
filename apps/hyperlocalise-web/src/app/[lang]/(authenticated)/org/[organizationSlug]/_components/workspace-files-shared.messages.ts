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
import type { MessageDescriptor } from "react-intl";
import { defineMessages } from "react-intl";

export const workspaceFilesSharedMessages = defineMessages({
  searchLabel: {
    defaultMessage: "Search",
    id: "b20aCSFLbS",
    description: "Label for the workspace files search field",
  },
  projectLabel: {
    defaultMessage: "Project",
    id: "h1w+zE8OFG",
    description: "Label for the workspace files project filter",
  },
  sourceLabel: {
    defaultMessage: "Source",
    id: "AfdTJhl3I7",
    description: "Label for the workspace files source origin filter",
  },
  typeLabel: {
    defaultMessage: "Type",
    id: "2w98ENBS95",
    description: "Label for the workspace files resource type filter",
  },
  providerLabel: {
    defaultMessage: "Provider",
    id: "34gyyDcFUG",
    description: "Label for the workspace files provider filter",
  },
  localeLabel: {
    defaultMessage: "Locale",
    id: "7yXPQhyKta",
    description: "Label for the workspace files locale filter",
  },
  syncLabel: {
    defaultMessage: "Sync",
    id: "7RXGOrYinp",
    description: "Label for the workspace files sync state filter",
  },
  searchPlaceholder: {
    defaultMessage: "Search by path, name, or provider ID",
    id: "hN8qhW4nL5",
    description: "Placeholder for the workspace files search input",
  },
  allProjects: {
    defaultMessage: "All projects",
    id: "UOISryu9xO",
    description: "Workspace files project filter option to show every project",
  },
  allSources: {
    defaultMessage: "All sources",
    id: "XLbc3ZzNpD",
    description: "Workspace files source filter option to show every origin",
  },
  allTypes: {
    defaultMessage: "All types",
    id: "MRWPAMp/Eg",
    description: "Workspace files type filter option to show every resource type",
  },
  allProviders: {
    defaultMessage: "All providers",
    id: "hf0JjIrtpG",
    description: "Workspace files provider filter option to show every provider",
  },
  allLocales: {
    defaultMessage: "All locales",
    id: "Nf+4tJMRVh",
    description: "Workspace files locale filter option to show every locale",
  },
  allSyncStates: {
    defaultMessage: "All sync states",
    id: "/X6DitE9lx",
    description: "Workspace files sync filter option to show every sync state",
  },
  originRepository: {
    defaultMessage: "Repository",
    id: "/fPQAQsNlu",
    description: "Workspace files origin badge or filter for repository-sourced files",
  },
  originProvider: {
    defaultMessage: "Provider",
    id: "y6fEOvlovF",
    description: "Workspace files origin badge or filter for provider-sourced files",
  },
  originCombined: {
    defaultMessage: "Repository + Provider",
    id: "eWpSMqLEvC",
    description: "Workspace files origin badge when a file comes from both repository and provider",
  },
  resourceTypeFile: {
    defaultMessage: "File",
    id: "FHYpiHKFtf",
    description: "Workspace files resource type badge or filter for file resources",
  },
  resourceTypeFiles: {
    defaultMessage: "Files",
    id: "e+CeFvSaNg",
    description: "Workspace files type filter option for file resources (plural)",
  },
  resourceTypeKey: {
    defaultMessage: "Key",
    id: "Qj9S5injry",
    description: "Workspace files resource type badge for key resources",
  },
  resourceTypeKeys: {
    defaultMessage: "Keys",
    id: "9D2YjR59lt",
    description: "Workspace files type filter option for key resources (plural)",
  },
  providerCrowdin: {
    defaultMessage: "Crowdin",
    id: "lAXDHpNMPS",
    description: "TMS provider brand name for Crowdin",
  },
  providerSmartling: {
    defaultMessage: "Smartling",
    id: "R9ah9+0AUl",
    description: "TMS provider brand name for Smartling",
  },
  providerPhrase: {
    defaultMessage: "Phrase",
    id: "2N/8jZzb94",
    description: "TMS provider brand name for Phrase",
  },
  providerLokalise: {
    defaultMessage: "Lokalise",
    id: "d5Z1STDBKG",
    description: "TMS provider brand name for Lokalise",
  },
  syncSynced: {
    defaultMessage: "Synced",
    id: "NIFt9XMskl",
    description: "Workspace files sync state when the file is up to date",
  },
  syncPending: {
    defaultMessage: "Pending",
    id: "frCipQZwRu",
    description: "Workspace files sync state when a sync is pending",
  },
  syncStale: {
    defaultMessage: "Stale",
    id: "CpwA2GAYax",
    description: "Workspace files sync state when the file is stale",
  },
  syncChanged: {
    defaultMessage: "Changed",
    id: "a4ctx1qVpW",
    description: "Workspace files sync state when the file has local changes",
  },
  readinessReady: {
    defaultMessage: "{count, plural, one {# ready} other {# ready}}",
    id: "p5nI6qGcmh",
    description: "Locale readiness summary segment for ready locales",
  },
  readinessMissing: {
    defaultMessage: "{count, plural, one {# missing} other {# missing}}",
    id: "7cvqogiF4e",
    description: "Locale readiness summary segment for missing or stale locales",
  },
  readinessChanged: {
    defaultMessage: "{count, plural, one {# changed} other {# changed}}",
    id: "Npxt3sLoB0",
    description: "Locale readiness summary segment for changed locales",
  },
  readinessLocales: {
    defaultMessage: "{count, plural, one {# locale} other {# locales}}",
    id: "U4v7cQLBDc",
    description: "Fallback locale readiness summary when only a total locale count is available",
  },
});

const originFilterMessages = {
  all: workspaceFilesSharedMessages.allSources,
  repository: workspaceFilesSharedMessages.originRepository,
  provider: workspaceFilesSharedMessages.originProvider,
} as const satisfies Record<"all" | "repository" | "provider", MessageDescriptor>;

const resourceTypeFilterMessages = {
  all: workspaceFilesSharedMessages.allTypes,
  file: workspaceFilesSharedMessages.resourceTypeFiles,
  key: workspaceFilesSharedMessages.resourceTypeKeys,
} as const satisfies Record<"all" | "file" | "key", MessageDescriptor>;

const providerKindFilterMessages = {
  all: workspaceFilesSharedMessages.allProviders,
  crowdin: workspaceFilesSharedMessages.providerCrowdin,
  smartling: workspaceFilesSharedMessages.providerSmartling,
  phrase: workspaceFilesSharedMessages.providerPhrase,
  lokalise: workspaceFilesSharedMessages.providerLokalise,
} as const satisfies Record<
  "all" | "crowdin" | "smartling" | "phrase" | "lokalise",
  MessageDescriptor
>;

const syncStateFilterMessages = {
  all: workspaceFilesSharedMessages.allSyncStates,
  synced: workspaceFilesSharedMessages.syncSynced,
  pending: workspaceFilesSharedMessages.syncPending,
  stale: workspaceFilesSharedMessages.syncStale,
  changed: workspaceFilesSharedMessages.syncChanged,
} as const satisfies Record<"all" | "synced" | "pending" | "stale" | "changed", MessageDescriptor>;

export function getOriginFilterMessage(
  origin: keyof typeof originFilterMessages,
): MessageDescriptor {
  return originFilterMessages[origin];
}

export function getResourceTypeFilterMessage(
  resourceType: keyof typeof resourceTypeFilterMessages,
): MessageDescriptor {
  return resourceTypeFilterMessages[resourceType];
}

export function getProviderKindFilterMessage(
  providerKind: keyof typeof providerKindFilterMessages,
): MessageDescriptor {
  return providerKindFilterMessages[providerKind];
}

export function getSyncStateFilterMessage(
  syncState: keyof typeof syncStateFilterMessages,
): MessageDescriptor {
  return syncStateFilterMessages[syncState];
}

export function getOriginBadgeMessage(
  origin: "repository" | "provider" | "combined",
): MessageDescriptor {
  switch (origin) {
    case "combined":
      return workspaceFilesSharedMessages.originCombined;
    case "provider":
      return workspaceFilesSharedMessages.originProvider;
    default:
      return workspaceFilesSharedMessages.originRepository;
  }
}

export function getResourceTypeBadgeMessage(resourceType: "file" | "key"): MessageDescriptor {
  return resourceType === "file"
    ? workspaceFilesSharedMessages.resourceTypeFile
    : workspaceFilesSharedMessages.resourceTypeKey;
}

export function getSyncStateBadgeMessage(syncState: string): MessageDescriptor | null {
  if (syncState in syncStateFilterMessages && syncState !== "all") {
    return syncStateFilterMessages[
      syncState as Exclude<keyof typeof syncStateFilterMessages, "all">
    ];
  }
  return null;
}

export function getProviderKindMessage(kind: string): MessageDescriptor | null {
  if (kind in providerKindFilterMessages && kind !== "all") {
    return providerKindFilterMessages[
      kind as Exclude<keyof typeof providerKindFilterMessages, "all">
    ];
  }
  return null;
}
