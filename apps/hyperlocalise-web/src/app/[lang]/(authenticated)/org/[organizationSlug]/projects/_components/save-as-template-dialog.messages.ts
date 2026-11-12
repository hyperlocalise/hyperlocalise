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
"use client";

import { defineMessages } from "react-intl";

export const saveAsTemplateDialogMessages = defineMessages({
  title: {
    defaultMessage: "Save as template",
    id: "Ucc9QKCpBQ",
    description: "Title of the dialog that saves a project as a project template",
  },
  description: {
    defaultMessage:
      "The template copies this project's languages, description, translation context, team, editor settings, translation memories and glossaries.",
    id: "Ps31BWNCZP",
    description: "Description of the save as template dialog",
  },
  nameLabel: {
    defaultMessage: "Template name",
    id: "7Hdjh6ytkj",
    description: "Label for the name of the template saved from a project",
  },
  nameRequired: {
    defaultMessage: "Enter a template name.",
    id: "MQklnXEkyr",
    description: "Validation error when the template name is empty",
  },
  nameTooLong: {
    defaultMessage: "Use at most {max, number} characters.",
    id: "FdrveAianf",
    description: "Validation error when the template name is too long",
  },
  cancel: {
    defaultMessage: "Cancel",
    id: "V26cwAwSbN",
    description: "Button that closes the save as template dialog",
  },
  save: {
    defaultMessage: "Save template",
    id: "S+EhEWSUFI",
    description: "Button that saves the project as a template",
  },
});
