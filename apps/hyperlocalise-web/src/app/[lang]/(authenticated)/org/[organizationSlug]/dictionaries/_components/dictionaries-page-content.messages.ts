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

export const dictionariesPageContentMessages = defineMessages({
  loadFailed: {
    defaultMessage: "Failed to load dictionaries.",
    id: "d8kP4nW2qL",
    description: "Error when the dictionaries list cannot be loaded",
  },
  createFailed: {
    defaultMessage: "Could not create the dictionary.",
    id: "m3rT7bH9sC",
    description: "Error when creating a spellcheck dictionary fails",
  },
  nameRequired: {
    defaultMessage: "Enter a name.",
    id: "v6wN1cJ8pA",
    description: "Validation error for an empty dictionary name",
  },
});
