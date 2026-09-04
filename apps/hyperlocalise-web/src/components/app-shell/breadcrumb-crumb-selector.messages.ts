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

export const breadcrumbCrumbSelectorMessages = defineMessages({
  empty: {
    defaultMessage: "No options available",
    id: "Tb7h0w/7fY",
    description: "Empty state when a breadcrumb selector has no items",
  },
  loadError: {
    defaultMessage: "Unable to load options",
    id: "XLYekd9yOT",
    description: "Error state when a breadcrumb selector fails to load items",
  },
  selected: {
    defaultMessage: "Selected",
    id: "4mbEhalZi9",
    description: "Hint shown beside the active item in a breadcrumb selector menu",
  },
  switchDomain: {
    defaultMessage: "Switch domain",
    id: "JBqUQN0+J0",
    description: "Menu label for the domain switcher in the breadcrumb",
  },
  domainsLoadError: {
    defaultMessage: "Unable to load domains",
    id: "moPVcf3ylY",
    description: "Error state when the domain breadcrumb selector fails to load domains",
  },
  switchTeam: {
    defaultMessage: "Switch team",
    id: "glmojNf0zj",
    description: "Menu label for the team switcher in the breadcrumb",
  },
  teamsLoadError: {
    defaultMessage: "Unable to load teams",
    id: "GpJgVP/u6k",
    description: "Error state when the team breadcrumb selector fails to load teams",
  },
  switchProject: {
    defaultMessage: "Switch project",
    id: "cDw6CT/CPx",
    description: "Menu label for the project switcher in the breadcrumb",
  },
  projectsLoadError: {
    defaultMessage: "Unable to load projects",
    id: "Nf77AX5l7/",
    description: "Error state when the project breadcrumb selector fails to load projects",
  },
  noProjects: {
    defaultMessage: "No projects found",
    id: "bimsDnjEKL",
    description: "Empty state when the project breadcrumb selector has no projects",
  },
});
