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
    id: "uZHj88pUeq",
    description: "Link back to the workspace domains list",
  },
  loadError: {
    defaultMessage: "Could not load this linked domain.",
    id: "fiJRizjueJ",
    description: "Error when a linked domain detail page fails to load",
  },
  auditLoadError: {
    defaultMessage: "Could not load the localisation audit report.",
    id: "LjtXYDMMAO",
    description: "Error when the attached audit report fails to load",
  },
  loading: {
    defaultMessage: "Loading domain…",
    id: "UKFf8HWVZX",
    description: "Loading state for linked domain detail",
  },
  noAudit: {
    defaultMessage: "No localisation audit is attached to this domain yet.",
    id: "cHNG0eH0rr",
    description: "Empty state when a linked domain has no audit",
  },
  openProject: {
    defaultMessage: "Open project",
    id: "g+hqtBNXIJ",
    description: "Button to open the project linked to this domain",
  },
  continueVerification: {
    defaultMessage: "Continue verification",
    id: "Y1DzYaPZ4D",
    description: "Button to continue verifying this domain",
  },
  statusLabel: {
    defaultMessage: "Status",
    id: "NW5w/HG5/G",
    description: "Label for linked domain status on the detail page",
  },
  reportHeading: {
    defaultMessage: "Localisation audit report",
    id: "X9s4kh3gLN",
    description: "Heading above the attached audit report on domain detail",
  },
});
