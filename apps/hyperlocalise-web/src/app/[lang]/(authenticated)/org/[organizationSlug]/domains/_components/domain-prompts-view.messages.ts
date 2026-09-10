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

export const domainPromptsViewMessages = defineMessages({
  promptLabel: {
    defaultMessage: "Prompt",
    id: "KzpahbggTa",
    description: "Prompt explorer input label",
  },
  run: {
    defaultMessage: "Run prompt",
    id: "7mHM45p5Gr",
    description: "Run the prompt across engines",
  },
  ran: {
    defaultMessage: "Answers refreshed for this market.",
    id: "uJhgTrf87d",
    description: "Toast after running a prompt",
  },
  emptyTitle: {
    defaultMessage: "No prompt sampled yet",
    id: "4w/GI31xOr",
    description: "Empty prompt explorer title",
  },
  emptyDescription: {
    defaultMessage: "Ask how buyers describe this category, then compare engine answers.",
    id: "88S+ZbXuL7",
    description: "Empty prompt explorer description",
  },
});
