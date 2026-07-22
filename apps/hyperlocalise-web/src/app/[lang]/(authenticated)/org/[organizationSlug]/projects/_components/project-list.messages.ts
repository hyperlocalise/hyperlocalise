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

export const projectListMessages = defineMessages({
  noDescription: {
    defaultMessage: "No description",
    id: "Onn6EwAIjq",
    description: "Fallback when a project list row has no description",
  },
  noTranslationContext: {
    defaultMessage: "No translation context",
    id: "/9wc0MhkMd",
    description: "Fallback when a project list row has no translation context",
  },
  createdUnavailable: {
    defaultMessage: "Created date unavailable",
    id: "iVNWaz9pgs",
    description: "Fallback when a project created date cannot be formatted",
  },
  updatedUnavailable: {
    defaultMessage: "Updated date unavailable",
    id: "XuLNOM8/60",
    description: "Fallback when a project updated date cannot be formatted",
  },
});
