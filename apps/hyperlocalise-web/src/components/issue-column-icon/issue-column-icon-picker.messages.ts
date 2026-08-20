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

export const issueColumnIconPickerMessages = defineMessages({
  trigger: {
    defaultMessage: "Choose column icon",
    id: "eD/50+uzSI",
    description: "Accessible label for the custom issue column icon picker trigger",
  },
  title: {
    defaultMessage: "Choose icon",
    id: "0bO6ZigdQm",
    description: "Title of the custom issue column icon picker popover",
  },
  search: {
    defaultMessage: "Search icons",
    id: "08MZDEQo7n",
    description: "Placeholder for searching the custom issue column icon catalog",
  },
  empty: {
    defaultMessage: "No icons match",
    id: "GqNUBHyk8j",
    description: "Empty state when the icon picker search has no results",
  },
  clear: {
    defaultMessage: "Use default",
    id: "2IB+W+9a77",
    description: "Action that clears a custom issue column icon back to the default",
  },
});
