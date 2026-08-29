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

export const projectIssueTemplatesPanelMessages = defineMessages({
  title: {
    defaultMessage: "Issue templates",
    id: "f+hW3BNp2e",
    description: "Title of the project issue templates settings section",
  },
  description: {
    defaultMessage:
      "Choose the template preselected when someone creates an issue for this project, and who each template should default to assigning. The Content Editor always preselects Context request, regardless of this setting.",
    id: "TdxzXMOinv",
    description: "Description of the project issue templates settings section",
  },
  defaultTemplateLabel: {
    defaultMessage: "Default template",
    id: "3kmGzc1eFE",
    description: "Label for the default template select",
  },
  assigneeByTemplateLabel: {
    defaultMessage: "Default assignee by template",
    id: "oV922EjrKR",
    description: "Label for the per-template default assignee list",
  },
  staleAssigneeBadge: {
    defaultMessage: "No longer has access",
    id: "acYdm9AkSl",
    description:
      "Badge shown next to a template's default assignee when that person can no longer be assigned issues in this project",
  },
  saveButton: {
    defaultMessage: "Save template settings",
    id: "7RTYPONjFh",
    description: "Button to save issue template settings",
  },
  saving: {
    defaultMessage: "Saving…",
    id: "hrkn2K1Geg",
    description: "Button label while issue template settings are saving",
  },
  saveSuccess: {
    defaultMessage: "Issue template settings saved",
    id: "/n68ooQLr1",
    description: "Toast after issue template settings save successfully",
  },
  saveError: {
    defaultMessage: "Unable to save issue template settings",
    id: "cT0FEm6nil",
    description: "Fallback toast when saving issue template settings fails",
  },
});
