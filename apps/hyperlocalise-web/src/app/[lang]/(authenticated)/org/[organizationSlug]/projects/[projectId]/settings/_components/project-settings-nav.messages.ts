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

export const projectSettingsNavMessages = defineMessages({
  navAriaLabel: {
    defaultMessage: "Project settings sections",
    id: "KdE//1z84h",
    description: "Accessible label for the project settings section navigation",
  },
  projectGroup: {
    defaultMessage: "Project",
    id: "wI7t6e90fP",
    description: "Project settings nav group for core project details",
  },
  workflowGroup: {
    defaultMessage: "Workflow",
    id: "uUA+SUYZ5E",
    description: "Project settings nav group for issue and editor workflow settings",
  },
  developerGroup: {
    defaultMessage: "Developer",
    id: "E9pJgVHyhd",
    description: "Project settings nav group for CLI and CI integration",
  },
  general: {
    defaultMessage: "General",
    id: "YAyLRsv6r6",
    description: "Project settings nav item for general project details",
  },
  styleGuide: {
    defaultMessage: "Style guide",
    id: "h3pguP9o4U",
    description: "Project settings nav item for the project style guide",
  },
  locales: {
    defaultMessage: "Locales",
    id: "CE0CliH/OW",
    description: "Project settings nav item for source and target locales",
  },
  issueTemplates: {
    defaultMessage: "Issue templates",
    id: "U6z1gdRGY3",
    description: "Project settings nav item for issue template assignees",
  },
  issueColumns: {
    defaultMessage: "Issue columns",
    id: "lFIWfq6Qqr",
    description: "Project settings nav item for issue sheet columns",
  },
  contentEditor: {
    defaultMessage: "Content editor",
    id: "+zgK4PjtCI",
    description: "Project settings nav item for translation and content editor behavior",
  },
  cli: {
    defaultMessage: "CLI & CI",
    id: "P3FTUn97ec",
    description: "Project settings nav item for connecting the CLI and CI",
  },
  unsavedChanges: {
    defaultMessage: "Unsaved changes",
    id: "TQazCG74CN",
    description: "Screen reader text for a project settings nav item with unsaved edits",
  },
});
