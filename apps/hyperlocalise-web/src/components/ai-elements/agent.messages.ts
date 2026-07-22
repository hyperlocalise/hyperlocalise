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

export const agentMessages = defineMessages({
  instructions: {
    id: "mltE2S4MiK",

    defaultMessage: "Instructions",
    description: "Section label for agent system instructions",
  },
  tools: {
    id: "5atqmuSxdx",

    defaultMessage: "Tools",
    description: "Section label for agent tools list",
  },
  noDescription: {
    id: "hCvBHiYeFU",

    defaultMessage: "No description",
    description: "Fallback when an agent tool has no description",
  },
  outputSchema: {
    id: "1zjzxzctS5",

    defaultMessage: "Output Schema",
    description: "Section label for agent output schema",
  },
});
