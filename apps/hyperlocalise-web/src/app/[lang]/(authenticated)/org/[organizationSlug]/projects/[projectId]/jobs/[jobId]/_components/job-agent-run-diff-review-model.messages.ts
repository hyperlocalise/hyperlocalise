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

export const jobAgentRunDiffReviewModelMessages = defineMessages({
  warningGlossary: {
    defaultMessage: "Glossary",
    id: "4895zl1/X5",
    description: "Warning type label for glossary issues on an agent proposal",
  },
  warningPlaceholder: {
    defaultMessage: "Placeholder",
    id: "7EM7rmfbAT",
    description: "Warning type label for placeholder issues on an agent proposal",
  },
  warningFormat: {
    defaultMessage: "Format",
    id: "b7cQsDBNuy",
    description: "Warning type label for format issues on an agent proposal",
  },
  warningConfidence: {
    defaultMessage: "Confidence",
    id: "88ySfb40EV",
    description: "Warning type label for low-confidence issues on an agent proposal",
  },
});
