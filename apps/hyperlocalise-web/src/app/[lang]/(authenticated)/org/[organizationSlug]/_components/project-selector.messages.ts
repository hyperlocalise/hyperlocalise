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

export const projectSelectorMessages = defineMessages({
  projectsUnavailable: {
    defaultMessage: "Projects unavailable",
    id: "chatProjectSelUnavailable",
    description: "Project selector label when workspace projects failed to load",
  },
  noProjects: {
    defaultMessage: "No projects",
    id: "chatProjectSelEmpty",
    description: "Project selector label when the workspace has no selectable projects",
  },
  projectPlaceholder: {
    defaultMessage: "Project",
    id: "chatProjectSelPlaceholder",
    description: "Project selector placeholder when no project is selected yet",
  },
  nativeGroup: {
    defaultMessage: "Hyperlocalise",
    id: "chatProjectSelNativeGroup",
    description: "Dropdown group label for native Hyperlocalise projects",
  },
  tmsGroup: {
    defaultMessage: "TMS",
    id: "chatProjectSelTmsGroup",
    description: "Dropdown group label for live TMS provider projects",
  },
});
