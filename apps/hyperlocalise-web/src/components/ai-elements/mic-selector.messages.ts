"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { defineMessages } from "react-intl";

export const micSelectorMessages = defineMessages({
  searchPlaceholder: {
    id: "sHrPdefvvp",

    defaultMessage: "Search microphones...",
    description: "Placeholder for the microphone search input",
  },
  noMicrophoneFound: {
    id: "8HFDJwATIe",

    defaultMessage: "No microphone found.",
    description: "Empty state when no microphones match the search",
  },
  selectMicrophone: {
    defaultMessage: "Select microphone...",
    id: "pcjLSSIwsF",
    description: "Placeholder shown when no microphone is selected",
  },
});
