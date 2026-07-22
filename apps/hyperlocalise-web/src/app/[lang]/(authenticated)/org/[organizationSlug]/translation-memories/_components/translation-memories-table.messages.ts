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

export const translationMemoriesTableMessages = defineMessages({
  sectionLabel: {
    defaultMessage: "Translation memories",
    id: "FxGatVHbDJ",
    description: "Accessible label for the translation memories list section",
  },
  loading: {
    defaultMessage: "Loading translation memories...",
    id: "hOWfLNcqMF",
    description: "Loading state for the translation memories list",
  },
  loadFailed: {
    defaultMessage: "Translation memories failed to load.",
    id: "Ww6hf/sreW",
    description: "Error heading when translation memories fail to load",
  },
  loadFailedFallback: {
    defaultMessage: "Try refreshing the page.",
    id: "0Jtniw8gvd",
    description: "Fallback error when translation memories fail to load without a message",
  },
  sourceWorkspace: {
    defaultMessage: "Workspace",
    id: "AEwGvK/0C4",
    description: "Source label for workspace-native translation memories in the list",
  },
  sourceExternalTms: {
    defaultMessage: "External TMS",
    id: "8DwB2zNR0Z",
    description: "Source label for external TMS translation memories without a provider badge",
  },
  updatedAt: {
    defaultMessage: "Updated {timestamp}",
    id: "61uI/yL9TQ",
    description: "Relative update time shown under a workspace translation memory name",
  },
  providerFallback: {
    defaultMessage: "Provider",
    id: "kGNYsYRLos",
    description: "Fallback provider label when the external provider kind is unknown",
  },
  projectId: {
    defaultMessage: "Project {projectId}",
    id: "7YA8COINzJ",
    description: "External project id shown in a translation memory row source detail",
  },
  viewLinkedProject: {
    defaultMessage: "View linked project",
    id: "Vqng5hm3eU",
    description: "Link to open the Hyperlocalise project linked to a translation memory",
  },
  externalProject: {
    defaultMessage: "External project {projectId}",
    id: "OnxK2+x1Hn",
    description: "Label for an external project id when no Hyperlocalise project is linked",
  },
  openInProvider: {
    defaultMessage: "Open in provider",
    id: "ScCeTTRmLH",
    description: "Link to open a translation memory in the external TMS provider",
  },
  segmentCount: {
    defaultMessage: "{countLabel} segments",
    id: "oK3y5p7erk",
    description: "Segment count shown for a translation memory row",
  },
  connectProvider: {
    defaultMessage: "Connect a provider",
    id: "hYx7Vbi5IN",
    description: "Empty-state button linking to integrations to connect a TMS provider",
  },
});
