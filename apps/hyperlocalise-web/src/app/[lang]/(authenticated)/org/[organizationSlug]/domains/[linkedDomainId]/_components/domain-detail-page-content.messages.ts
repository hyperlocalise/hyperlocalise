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

export const domainDetailPageContentMessages = defineMessages({
  backToDomains: {
    defaultMessage: "Back to domains",
    id: "DomDetBack01",
    description: "Link back to the workspace domains list",
  },
  loadError: {
    defaultMessage: "Could not load this linked domain.",
    id: "DomDetLoadErr",
    description: "Error when a linked domain detail page fails to load",
  },
  auditLoadError: {
    defaultMessage: "Could not load the localisation audit report.",
    id: "DomDetAudErr",
    description: "Error when the attached audit report fails to load",
  },
  loading: {
    defaultMessage: "Loading domain…",
    id: "DomDetLoading",
    description: "Loading state for linked domain detail",
  },
  noAudit: {
    defaultMessage: "No localisation audit is attached to this domain yet.",
    id: "DomDetNoAudit",
    description: "Empty state when a linked domain has no audit",
  },
  openProject: {
    defaultMessage: "Open project",
    id: "DomDetOpenPrj",
    description: "Button to open the project linked to this domain",
  },
  continueVerification: {
    defaultMessage: "Continue verification",
    id: "DomDetContVer",
    description: "Button to continue verifying this domain",
  },
  statusLabel: {
    defaultMessage: "Status",
    id: "DomDetStatus",
    description: "Label for linked domain status on the detail page",
  },
  reportHeading: {
    defaultMessage: "Localisation audit report",
    id: "DomDetRepHead",
    description: "Heading above the attached audit report on domain detail",
  },
});
