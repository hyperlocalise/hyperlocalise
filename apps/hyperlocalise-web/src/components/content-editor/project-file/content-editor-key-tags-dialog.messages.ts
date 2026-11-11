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

export const contentEditorKeyTagsDialogMessages = defineMessages({
  title: {
    defaultMessage: "Tags for {count, plural, one {# string} other {# strings}}",
    id: "AfRI7Xnx3X",
    description: "Title of the dialog that adds and removes tags on the ticked strings",
  },
  description: {
    defaultMessage:
      "Separate tags with commas. A tag is up to 64 letters, digits, _ or -. Tags apply in every language.",
    id: "D6oB7iB5pO",
    description: "Explains how to type tags in the bulk tag dialog",
  },
  addLabel: {
    defaultMessage: "Add tags",
    id: "flTlWIFXFz",
    description: "Label of the field listing tags to add to the ticked strings",
  },
  removeLabel: {
    defaultMessage: "Remove tags",
    id: "0WE6pTCDCg",
    description: "Label of the field listing tags to remove from the ticked strings",
  },
  invalidTag: {
    defaultMessage: "A tag is up to 64 letters, digits, _ or -, with no spaces.",
    id: "RV2r5y4a1g",
    description: "Error when a typed tag breaks the tag rule",
  },
  tooManyTags: {
    defaultMessage: "Add or remove at most {limit} tags at a time.",
    id: "Lp8ZE0j8y6",
    description: "Error when more tags are typed than one change allows",
  },
  saveFailed: {
    defaultMessage: "The tags could not be saved.",
    id: "uPi6FOf1vh",
    description: "Error when saving tags on the ticked strings fails",
  },
  save: {
    defaultMessage: "Save tags",
    id: "VO24g3+0FZ",
    description: "Saves the tag changes on the ticked strings",
  },
  cancel: {
    defaultMessage: "Cancel",
    id: "Y4dn5J3q9d",
    description: "Closes the bulk tag dialog without saving",
  },
});
