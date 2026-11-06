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

export const contentEditorSourceTextEditorMessages = defineMessages({
  title: {
    defaultMessage: "Source text",
    id: "wiCIzRCQIm",
    description: "Content editor side panel section that shows and edits a string's source text",
  },
  edit: {
    defaultMessage: "Edit source text",
    id: "AjI0x7x00R",
    description: "Button that opens the source text editor for the selected string",
  },
  fieldLabel: {
    defaultMessage: "Source text",
    id: "a0Z+O2nESA",
    description: "Accessible label of the field that edits a string's source text",
  },
  smallFix: {
    defaultMessage: "Keep translations approved",
    id: "SipE8X0v9J",
    description:
      "Checkbox that keeps approved translations approved when the source text edit is saved",
  },
  smallFixHelp: {
    defaultMessage:
      "For typo or punctuation fixes. Leave it off when the meaning changed, so this string's translations go back to review.",
    id: "SLKwPUzO0o",
    description: "Help text under the source text editor's small fix checkbox",
  },
  save: {
    defaultMessage: "Save source text",
    id: "JF5Ko4sIex",
    description: "Saves the edited source text",
  },
  cancel: {
    defaultMessage: "Cancel",
    id: "Hzrn9IQdCA",
    description: "Closes the source text editor without saving",
  },
  blank: {
    defaultMessage: "Source text can't be empty.",
    id: "YL77Wc37UE",
    description: "Error when the edited source text is empty",
  },
  saveFailed: {
    defaultMessage: "Unable to save source text",
    id: "S9AU7Fr7+S",
    description: "Error when saving the edited source text fails",
  },
  saved: {
    defaultMessage: "Source text saved",
    id: "mfitkmuApx",
    description: "Toast after a string's source text was saved in the content editor",
  },
});
