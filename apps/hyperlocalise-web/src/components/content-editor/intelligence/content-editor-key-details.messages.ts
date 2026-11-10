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

export const contentEditorKeyDetailsMessages = defineMessages({
  tagsLabel: {
    defaultMessage: "Tags",
    id: "8vCpYHi50M",
    description: "Label before the tags of a string in the content editor's context panel",
  },
  filterByTag: {
    defaultMessage: "Show strings tagged {tag}",
    id: "hvyRj/XXHi",
    description:
      "Accessible label of a tag in the context panel; clicking it filters the list by that tag",
  },
  removeTag: {
    defaultMessage: "Remove tag {tag}",
    id: "bNrLsIXQVf",
    description: "Accessible label of the button that removes one tag from the string",
  },
  addTagLabel: {
    defaultMessage: "Add tags",
    id: "41dxtjvcHt",
    description: "Accessible label of the field for adding tags to the string",
  },
  addTagPlaceholder: {
    defaultMessage: "Add tags, separated by commas",
    id: "1EX8BF1B5A",
    description: "Placeholder in the field for adding tags to a string",
  },
  addTag: {
    defaultMessage: "Add tag",
    id: "9tfsljQ2zK",
    description: "Button that adds the typed tags to the string",
  },
  invalidTag: {
    defaultMessage: "A tag is up to 64 letters, digits, _ or -, with no spaces.",
    id: "RV2r5y4a1g",
    description: "Error when a typed tag breaks the tag rule",
  },
  tagsFailed: {
    defaultMessage: "The tags could not be saved.",
    id: "qS9mjfnHgT",
    description: "Error when saving a string's tags fails",
  },
  openDesign: {
    defaultMessage: "Open design",
    id: "ZWQRslmNm4",
    description: "Link to the design (such as a Figma frame) where the string appears",
  },
  addDesignUrl: {
    defaultMessage: "Add design link",
    id: "pcgqyhORzm",
    description: "Button that opens the field for linking the string to its design",
  },
  editDesignUrl: {
    defaultMessage: "Edit link",
    id: "8rJlIWqu54",
    description: "Button that opens the field for changing the string's design link",
  },
  designUrlLabel: {
    defaultMessage: "Design link",
    id: "LVqkVOBqQp",
    description: "Label of the field for the address of the design where the string appears",
  },
  invalidDesignUrl: {
    defaultMessage: "Use an address starting with https:// or http://.",
    id: "zEEmo95qSa",
    description: "Error when a design link is not an http or https address",
  },
  designUrlFailed: {
    defaultMessage: "The design link could not be saved.",
    id: "3Fpuv4kRYl",
    description: "Error when saving a string's design link fails",
  },
  removeDesignUrl: {
    defaultMessage: "Remove link",
    id: "T8HLBLj6ph",
    description: "Button that clears the string's design link",
  },
  save: {
    defaultMessage: "Save",
    id: "EqpbvDBXCF",
    description: "Saves the string's design link",
  },
  cancel: {
    defaultMessage: "Cancel",
    id: "o7UvybjKCR",
    description: "Closes the design link field without saving",
  },
});
