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

export const reasoningMessages = defineMessages({
  thinking: {
    id: "7SvzEySkCN",

    defaultMessage: "Thinking...",
    description: "Label shown while the model is actively reasoning",
  },
  thoughtFewSeconds: {
    id: "IW+967m+1e",

    defaultMessage: "Thought for a few seconds",
    description: "Label when reasoning completed without a measured duration",
  },
  thoughtDuration: {
    id: "gQ9rDnH0hp",

    defaultMessage: "Thought for {duration} seconds",
    description: "Label showing how long the model spent reasoning",
  },
});
