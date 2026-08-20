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

export const domainsPageContentMessages = defineMessages({
  pageDescription: {
    defaultMessage:
      "Domains verified for this workspace, with linked projects and localisation audit reports.",
    id: "lZrVrk7oZs",
    description: "Domains workspace page description",
  },
  loadError: {
    defaultMessage: "Could not load linked domains.",
    id: "BBrh+7z4Oj",
    description: "Error when the domains list fails to load",
  },
  loading: {
    defaultMessage: "Loading domains…",
    id: "0cJX5jLe/m",
    description: "Loading state for the domains list",
  },
  empty: {
    defaultMessage:
      "No linked domains yet. Claim a domain from a localisation audit to get started.",
    id: "blgD4379yD",
    description: "Empty state for the domains list",
  },
  statusPending: {
    defaultMessage: "Pending verification",
    id: "M9l7nT/Rpj",
    description: "Linked domain status label for pending verification",
  },
  statusVerified: {
    defaultMessage: "Verified",
    id: "3GLhqP/R2l",
    description: "Linked domain status label for verified",
  },
  statusFailed: {
    defaultMessage: "Failed",
    id: "LRZ3vQhI80",
    description: "Linked domain status label for failed",
  },
  statusRevoked: {
    defaultMessage: "Revoked",
    id: "i9wq9AC2+9",
    description: "Linked domain status label for revoked",
  },
  scoreLabel: {
    defaultMessage: "Score {score}",
    id: "Xg01khiunA",
    description: "Audit score label on a domain list row",
  },
  scoreUnavailable: {
    defaultMessage: "No score yet",
    id: "8UNQ0H4OW1",
    description: "Shown when a linked domain has no audit score",
  },
  viewReport: {
    defaultMessage: "View report",
    id: "KRbtCrnBZw",
    description: "Link to open a linked domain audit report",
  },
  continueVerification: {
    defaultMessage: "Continue verification",
    id: "k3MhPbqttd",
    description: "Link to continue verifying a pending linked domain",
  },
  openProject: {
    defaultMessage: "Open project",
    id: "greERnCNu1",
    description: "Link to open the project attached to a linked domain",
  },
});
