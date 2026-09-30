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
  projectHeading: {
    defaultMessage: "Project assignment",
    id: "N5l60V4waX",
    description: "Heading for managing the project linked to a domain",
  },
  projectDescription: {
    defaultMessage: "Attach this verified domain to a project or leave it unassigned.",
    id: "s4VZkMnyhB",
    description: "Description for domain project assignment",
  },
  noProject: {
    defaultMessage: "No project",
    id: "B90Z7UPFjc",
    description: "Option to remove a domain project assignment",
  },
  selectProject: {
    defaultMessage: "Select a project",
    id: "BG9pW4nUm7",
    description: "Placeholder for selecting a domain project",
  },
  saveProject: {
    defaultMessage: "Save project assignment",
    id: "plpqSFRajq",
    description: "Button to save a domain project assignment",
  },
  projectSaved: {
    defaultMessage: "Project assignment updated.",
    id: "aGF9GYZOTY",
    description: "Toast after updating a domain project assignment",
  },
  projectUpdateError: {
    defaultMessage: "Could not update the project assignment.",
    id: "8CGr1e/rbK",
    description: "Error when updating a domain project assignment fails",
  },
  projectsLoadError: {
    defaultMessage: "Could not load workspace projects.",
    id: "gExq27B2VB",
    description: "Error when projects cannot be loaded for domain assignment",
  },
  statusLabel: {
    defaultMessage: "Status",
    id: "NW5w/HG5/G",
    description: "Label for linked domain status on the detail page",
  },
  marketsHeading: {
    defaultMessage: "Research markets",
    id: "Te5Z3Go8As",
    description: "Heading for linked domain market selection",
  },
  marketsDescription: {
    defaultMessage: "Choose the markets used for this domain’s research.",
    id: "CLV3Q206dT",
    description: "Help text for linked domain market selection",
  },
  editMarkets: {
    defaultMessage: "Edit markets",
    id: "L2itdwaRts",
    description: "Button to edit linked domain research markets",
  },
  noMarkets: {
    defaultMessage: "No research markets selected.",
    id: "XHSMBIh/Jj",
    description: "Empty state for linked domain research markets",
  },
  verifyPending: {
    defaultMessage: "Verify this domain to unlock the full localisation audit report.",
    id: "0uC+32o+7p",
    description: "Message when domain detail cannot show the report until verification succeeds",
  },
  reportHeading: {
    defaultMessage: "Localisation audit report",
    id: "X9s4kh3gLN",
    description: "Heading above the attached audit report on domain detail",
  },
});
