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

export const teamFormMessages = defineMessages({
  nameRequired: {
    defaultMessage: "Team name is required.",
    id: "TKbQtKFrh9",
    description: "Validation error when the team name is empty",
  },
  nameTooLong: {
    defaultMessage: "Team name must be 120 characters or fewer.",
    id: "R/pK1EOhod",
    description: "Validation error when the team name exceeds 120 characters",
  },
  slugRequired: {
    defaultMessage: "Team slug is required.",
    id: "x9bd7qMA5t",
    description: "Validation error when the team slug is empty",
  },
  slugInvalid: {
    defaultMessage: "Use lowercase letters, numbers, and hyphens only.",
    id: "mZxMVREyg5",
    description: "Validation error when the team slug has invalid characters",
  },
  slugTooLong: {
    defaultMessage: "Team slug must be 120 characters or fewer.",
    id: "XVkuBQ3TjB",
    description: "Validation error when the team slug exceeds 120 characters",
  },
});
