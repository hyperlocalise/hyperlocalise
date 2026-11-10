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

export const contentEditorTagSearchMessages = defineMessages({
  suggestions: {
    defaultMessage: "Tags",
    id: "mUXQkRdOUM",
    description:
      "Accessible name of the list of tags suggested while typing tag: in the search box",
  },
  noMatch: {
    defaultMessage: "No tag starts with “{tag}”. Press Enter to filter by it anyway.",
    id: "3U75G4dbo+",
    description: "Shown under the search box when no project tag matches the typed tag: word",
  },
  typeTag: {
    defaultMessage: "Type a tag: letters, digits, _ or -.",
    id: "JDTNGclSHY",
    description: "Shown under the search box after tag: until a valid tag is typed",
  },
  chipsLabel: {
    defaultMessage: "Filtered by tags",
    id: "w7Pf6lfSKh",
    description: "Accessible name of the row of tag filters beside the search box",
  },
  removeTag: {
    defaultMessage: "Remove tag filter {tag}",
    id: "y/TdSTzZZC",
    description: "Removes one tag from the search filter",
  },
  searchPlaceholder: {
    defaultMessage: "Search text, or tag:name…",
    id: "S0jhrnZyoj",
    description:
      "Placeholder of the content editor search box on native projects, where tag: filters by tag",
  },
});
