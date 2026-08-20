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

export const issueRelationshipKindMessages = defineMessages({
  related: {
    defaultMessage: "Related",
    id: "7UoNPs2uZA",
    description: "Relationship kind: symmetric related issue",
  },
  blocks: {
    defaultMessage: "Blocks",
    id: "/ptCxvciMe",
    description: "Relationship kind: this issue blocks another",
  },
  blockedBy: {
    defaultMessage: "Blocked by",
    id: "r0jIUbQa43",
    description: "Relationship kind: this issue is blocked by another",
  },
  duplicateOf: {
    defaultMessage: "Duplicate of",
    id: "HcfE0xA2HB",
    description: "Relationship kind: this issue is a duplicate of another",
  },
  duplicates: {
    defaultMessage: "Duplicates",
    id: "YreYFnwbaP",
    description: "Relationship kind: another issue is a duplicate of this one",
  },
});
