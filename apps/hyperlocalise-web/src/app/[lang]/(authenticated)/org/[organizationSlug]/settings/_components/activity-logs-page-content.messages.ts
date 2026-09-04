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

export const activityLogsPageContentMessages = defineMessages({
  pageLabel: {
    defaultMessage: "Workspace",
    id: "sa3vn/n2AP",
    description: "Eyebrow for the activity logs settings page",
  },
  pageTitle: {
    defaultMessage: "Activity logs",
    id: "RZLaeRVZkR",
    description: "Title for the activity logs settings page",
  },
  pageDescription: {
    defaultMessage: "Review important changes made across your workspace.",
    id: "J6COMAGjgx",
    description: "Description for the activity logs settings page",
  },
  eventTypeLabel: {
    defaultMessage: "Event types",
    id: "JMjChjpgin",
    description: "Label for the activity log event type filter",
  },
  eventTypeHint: {
    defaultMessage: "Choose one or more event types.",
    id: "eylM+FrZVS",
    description: "Hint for the activity log event type filter",
  },
  allEventTypes: {
    defaultMessage: "All event types",
    id: "IFRCTnWoxJ",
    description: "Trigger label when no activity log event type filter is selected",
  },
  selectedEventTypes: {
    defaultMessage: "{count, plural, one {# event type} other {# event types}}",
    id: "N25DNkeGO9",
    description: "Trigger label showing how many activity log event types are selected",
  },
  eventTypePickerTitle: {
    defaultMessage: "Filter by event type",
    id: "IJZ5NzBvzc",
    description: "Title for the activity log event type picker popover",
  },
  searchEventTypes: {
    defaultMessage: "Search event types…",
    id: "fHlu5dBILg",
    description: "Search placeholder for the activity log event type picker",
  },
  selectAllEventTypes: {
    defaultMessage: "Select all",
    id: "wDUtJytI6K",
    description: "Action to select every activity log event type",
  },
  clearEventTypes: {
    defaultMessage: "Clear",
    id: "FZLS2UNMjT",
    description: "Action to clear the activity log event type filter",
  },
  noMatchingEventTypes: {
    defaultMessage: "No event types match your search.",
    id: "UeLBtvYSfh",
    description: "Empty search state for the activity log event type picker",
  },
  removeEventType: {
    defaultMessage: "Remove {eventType}",
    id: "+WsHQLSMmY",
    description: "Accessible label for removing an event type filter",
  },
  membershipEventGroup: {
    defaultMessage: "Membership",
    id: "3Di0YY2oCY",
    description: "Activity log event type group for membership changes",
  },
  workspaceEventGroup: {
    defaultMessage: "Workspace",
    id: "aywt09Rd3f",
    description: "Activity log event type group for workspace changes",
  },
  accessEventGroup: {
    defaultMessage: "Access",
    id: "1B4aT4LjmI",
    description: "Activity log event type group for access credentials",
  },
  integrationEventGroup: {
    defaultMessage: "Integrations",
    id: "uGEhX6O1Cq",
    description: "Activity log event type group for integrations",
  },
  projectEventGroup: {
    defaultMessage: "Projects",
    id: "PtuAq3jpEr",
    description: "Activity log event type group for projects",
  },
  glossaryEventGroup: {
    defaultMessage: "Glossaries",
    id: "jzcCuqtaG/",
    description: "Activity log event type group for glossaries",
  },
  translationMemoryEventGroup: {
    defaultMessage: "Translation memory",
    id: "c8j3V+HaKx",
    description: "Activity log event type group for translation memory",
  },
  actorLabel: {
    defaultMessage: "Actor",
    id: "DsCAD1RMQU",
    description: "Label for the activity log actor filter",
  },
  allActors: {
    defaultMessage: "Everyone",
    id: "wA5BTp/Pxl",
    description: "Option for showing activity from every actor",
  },
  systemActor: {
    defaultMessage: "System",
    id: "hG2aICUYGv",
    description: "Activity log actor filter option for system events",
  },
  agentActor: {
    defaultMessage: "Agent",
    id: "8U3urKYKTg",
    description: "Activity log actor filter option for agent events",
  },
  apiKeyActor: {
    defaultMessage: "API credential",
    id: "WPxe7oDZ6H",
    description: "Activity log actor filter option for API credential events",
  },
  rangeLabel: {
    defaultMessage: "Time range",
    id: "B5D1S4eh8Q",
    description: "Label for the activity log time range filter",
  },
  range24h: {
    defaultMessage: "Last 24 hours",
    id: "HxXrdebYXD",
    description: "Activity log range option for the last 24 hours",
  },
  range7d: {
    defaultMessage: "Last 7 days",
    id: "P5PPN7NCNo",
    description: "Activity log range option for the last 7 days",
  },
  range30d: {
    defaultMessage: "Last 30 days",
    id: "GjSV4h+zSK",
    description: "Activity log range option for the last 30 days",
  },
  rangeAll: {
    defaultMessage: "All time",
    id: "z3rfJZn/iw",
    description: "Activity log range option for all time",
  },
  activityListLabel: {
    defaultMessage: "Workspace activity",
    id: "RVgaLGNH6a",
    description: "Accessible label for the activity log list",
  },
  loading: {
    defaultMessage: "Loading activity…",
    id: "6At7mQKfX7",
    description: "Loading state for activity logs",
  },
  emptyTitle: {
    defaultMessage: "No activity yet",
    id: "qzupTaytsB",
    description: "Empty state title for activity logs",
  },
  emptyDescription: {
    defaultMessage: "Changes made by workspace operators will appear here.",
    id: "0nWdyNoMtT",
    description: "Empty state description for activity logs",
  },
  loadErrorTitle: {
    defaultMessage: "Activity logs could not be loaded",
    id: "bVLy351hp/",
    description: "Error title when activity logs fail to load",
  },
  loadErrorFallback: {
    defaultMessage: "Try again in a moment.",
    id: "3DTP0kcy7g",
    description: "Fallback error description for activity logs",
  },
  retry: {
    defaultMessage: "Retry",
    id: "a5o9fiNTUJ",
    description: "Retry button for activity logs",
  },
  clearFilters: {
    defaultMessage: "Clear filters",
    id: "nOnn7HtqN6",
    description: "Button to clear activity log filters",
  },
  loadMore: {
    defaultMessage: "Load more",
    id: "z4rY7Y3WKu",
    description: "Load more button for activity logs",
  },
  eventDescription: {
    defaultMessage: "{actor} {action}{target}",
    id: "MpneVvPxE9",
    description: "Human-readable activity log event sentence",
  },
  memberInvitedAction: {
    defaultMessage: "invited a member",
    id: "1xfAnPlbdy",
    description: "Action for a member invitation activity",
  },
  memberInviteResentAction: {
    defaultMessage: "resent a member invitation",
    id: "C2s1+2PcGk",
    description: "Action for a resent member invitation activity",
  },
  memberRoleChangedAction: {
    defaultMessage: "changed a member's role",
    id: "ZJldmeEodt",
    description: "Action for a changed member role activity",
  },
  memberRemovedAction: {
    defaultMessage: "removed a member",
    id: "R32W5WVswi",
    description: "Action for a removed member activity",
  },
  workspaceUpdatedAction: {
    defaultMessage: "updated workspace settings",
    id: "QJD09qoHFD",
    description: "Action for a workspace settings activity",
  },
  personalAccessTokenCreatedAction: {
    defaultMessage: "created a personal access token",
    id: "rkBJkeQXS6",
    description: "Action for a personal access token creation activity",
  },
  personalAccessTokenRevokedAction: {
    defaultMessage: "revoked a personal access token",
    id: "KUk2sS3WzB",
    description: "Action for a personal access token revocation activity",
  },
  integrationConnectedAction: {
    defaultMessage: "connected an integration",
    id: "GMqTpOh8aZ",
    description: "Action for an integration connection activity",
  },
  integrationDisconnectedAction: {
    defaultMessage: "disconnected an integration",
    id: "d7IQwgk/dt",
    description: "Action for an integration disconnection activity",
  },
  projectCreatedAction: {
    defaultMessage: "created a project",
    id: "ENauN48xg5",
    description: "Action for a project creation activity",
  },
  projectArchivedAction: {
    defaultMessage: "archived a project",
    id: "qikQQxqXrr",
    description: "Action for a project archive activity",
  },
  projectDeletedAction: {
    defaultMessage: "deleted a project",
    id: "fSTcFbGhuZ",
    description: "Action for a project deletion activity",
  },
  projectSettingsChangedAction: {
    defaultMessage: "changed project settings",
    id: "ZJQEqdYVdl",
    description: "Action for a project settings activity",
  },
  glossaryCreatedAction: {
    defaultMessage: "created a glossary",
    id: "e0taRiVgjL",
    description: "Action for a glossary creation activity",
  },
  glossaryDeletedAction: {
    defaultMessage: "deleted a glossary",
    id: "08svfZAX+A",
    description: "Action for a glossary deletion activity",
  },
  glossaryImportedAction: {
    defaultMessage: "imported a glossary",
    id: "3gQZQhrwGd",
    description: "Action for a glossary import activity",
  },
  glossaryExportedAction: {
    defaultMessage: "exported a glossary",
    id: "mYvtIxq6nm",
    description: "Action for a glossary export activity",
  },
  glossaryOwnershipChangedAction: {
    defaultMessage: "changed glossary ownership",
    id: "N84k8CXWM3",
    description: "Action for a glossary ownership activity",
  },
  glossaryProjectAttachedAction: {
    defaultMessage: "attached a glossary to a project",
    id: "8AAU54/Ifs",
    description: "Action for attaching a glossary to a project",
  },
  glossaryProjectDetachedAction: {
    defaultMessage: "detached a glossary from a project",
    id: "aS+CWaJmSS",
    description: "Action for detaching a glossary from a project",
  },
  translationMemoryCreatedAction: {
    defaultMessage: "created translation memory",
    id: "CI8KudXI0N",
    description: "Action for a translation memory creation activity",
  },
  translationMemoryDeletedAction: {
    defaultMessage: "deleted translation memory",
    id: "ubBkJvCd51",
    description: "Action for a translation memory deletion activity",
  },
  translationMemoryImportedAction: {
    defaultMessage: "imported translation memory",
    id: "TYisbjRrWY",
    description: "Action for a translation memory import activity",
  },
  translationMemoryExportedAction: {
    defaultMessage: "exported translation memory",
    id: "HsKYBaml0e",
    description: "Action for a translation memory export activity",
  },
  translationMemoryProjectAttachedAction: {
    defaultMessage: "attached translation memory to a project",
    id: "HSs8QGWi6n",
    description: "Action for attaching translation memory to a project",
  },
  translationMemoryProjectDetachedAction: {
    defaultMessage: "detached translation memory from a project",
    id: "sz2LfqYMb0",
    description: "Action for detaching translation memory from a project",
  },
});
