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

export const projectFileCatValidationMessages = defineMessages({
  requestFailed: {
    defaultMessage: "Segment validation request failed.",
    id: "76aHgfoqyy",
    description: "Error when the CAT segment validation network request fails",
  },
  invalidJson: {
    defaultMessage: "Segment validation returned invalid JSON.",
    id: "u2Jgj/8hB5",
    description: "Error when the CAT segment validation response body is not valid JSON",
  },
  invalidResponse: {
    defaultMessage: "Segment validation returned an invalid response.",
    id: "zhUOSqs0dW",
    description: "Error when the CAT segment validation response fails schema validation",
  },
});
