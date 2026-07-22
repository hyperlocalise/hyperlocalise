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

export const glossariesTableMessages = defineMessages({
  sectionLabel: {
    defaultMessage: "Glossaries",
    id: "OwqE5YCGeO",
    description: "Accessible label for the glossaries list section",
  },
  loading: {
    defaultMessage: "Loading glossaries...",
    id: "fUTALFqIcb",
    description: "Loading state for the glossaries list",
  },
  loadFailed: {
    defaultMessage: "Glossaries failed to load.",
    id: "ZdLG4i9xoR",
    description: "Error heading when glossaries fail to load",
  },
  loadFailedFallback: {
    defaultMessage: "Try refreshing the page.",
    id: "VyUTnEU0ZM",
    description: "Fallback error when glossaries fail to load without a message",
  },
  sourceWorkspace: {
    defaultMessage: "Workspace",
    id: "XXixo4/l3k",
    description: "Source label for workspace-native glossaries in the list",
  },
  sourceExternalTms: {
    defaultMessage: "External TMS",
    id: "S62HZ0fFCx",
    description: "Source label for external TMS glossaries without a provider badge",
  },
  nativeSourceDetail: {
    defaultMessage: "{localePair} · Updated {timestamp}",
    id: "uZ8yLsRfe5",
    description: "Source detail line under a workspace glossary name",
  },
  providerFallback: {
    defaultMessage: "Provider",
    id: "kGNYsYRLos",
    description: "Fallback provider label when the external provider kind is unknown",
  },
  projectId: {
    defaultMessage: "Project {projectId}",
    id: "unWMnZBm3r",
    description: "External project id shown in a glossary row source detail",
  },
  viewLinkedProject: {
    defaultMessage: "View linked project",
    id: "n0lpKxJnLj",
    description: "Link to open the Hyperlocalise project linked to a glossary",
  },
  viewJobs: {
    defaultMessage: "View jobs",
    id: "jkeryc7TRJ",
    description: "Link to open jobs for a project linked to a glossary",
  },
  externalProject: {
    defaultMessage: "External project {projectId}",
    id: "OnxK2+x1Hn",
    description: "Label for an external project id when no Hyperlocalise project is linked",
  },
  openInProvider: {
    defaultMessage: "Open in provider",
    id: "eBDA87G8la",
    description: "Link to open a glossary in the external TMS provider",
  },
  termCount: {
    defaultMessage: "{countLabel} terms",
    id: "KMxAKNLBFq",
    description: "Term count shown for a glossary row",
  },
  connectProvider: {
    defaultMessage: "Connect a provider",
    id: "hYx7Vbi5IN",
    description: "Empty-state button linking to integrations to connect a TMS provider",
  },
});
