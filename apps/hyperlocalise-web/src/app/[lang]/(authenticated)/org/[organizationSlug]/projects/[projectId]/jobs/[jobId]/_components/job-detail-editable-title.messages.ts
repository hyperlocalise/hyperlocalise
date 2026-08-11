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

export const jobDetailEditableTitleMessages = defineMessages({
  titleAriaLabel: {
    defaultMessage: "Job title",
    id: "AXYQB+ayG/",
    description: "Accessible label for the editable job title field",
  },
  titleRequired: {
    defaultMessage: "Title is required",
    id: "M30SNTxWXn",
    description: "Toast when saving a job with an empty title",
  },
  saveFailed: {
    defaultMessage: "Couldn't save title",
    id: "kO32zaHAd6",
    description: "Toast when job title save fails",
  },
});
