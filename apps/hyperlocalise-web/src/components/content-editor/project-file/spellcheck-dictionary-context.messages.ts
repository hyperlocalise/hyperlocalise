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

export const spellcheckDictionaryContextMessages = defineMessages({
  loadFailed: {
    defaultMessage: "Failed to load spellcheck dictionaries.",
    id: "r5tY2mK8pQ",
    description: "Error when CAT cannot load the project spellcheck allow-list",
  },
  noDictionary: {
    defaultMessage: "Attach a dictionary to this project first.",
    id: "w9nL4cH6sD",
    description: "Error when adding a spelling word with no attached dictionary",
  },
  addFailed: {
    defaultMessage: "Could not add that word to the dictionary.",
    id: "b2jF7vX1kP",
    description: "Error when adding a CAT spelling token to a dictionary fails",
  },
  addSuccess: {
    defaultMessage: "Added {word} to {dictionary}.",
    id: "h6qM3zT8nA",
    description: "Toast after a spelling token is added to a dictionary",
  },
});
