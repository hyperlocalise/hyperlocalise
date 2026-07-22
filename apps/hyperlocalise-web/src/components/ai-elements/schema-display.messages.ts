"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { defineMessages } from "react-intl";

export const schemaDisplayMessages = defineMessages({
  parameters: {
    id: "kXbSfNBQLK",

    defaultMessage: "Parameters",
    description: "Section title for API schema parameters",
  },
  requestBody: {
    id: "XdMf1WMmy8",

    defaultMessage: "Request Body",
    description: "Section title for API request body schema",
  },
  response: {
    id: "A9BYSi93bG",

    defaultMessage: "Response",
    description: "Section title for API response schema",
  },
  required: {
    id: "r7/0syRDA9",

    defaultMessage: "required",
    description: "Badge label for a required schema property",
  },
});
