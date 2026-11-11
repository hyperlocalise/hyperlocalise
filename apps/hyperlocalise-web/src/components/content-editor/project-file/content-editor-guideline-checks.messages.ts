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

export const contentEditorGuidelineCheckMessages = defineMessages({
  label: {
    defaultMessage: "Guideline",
    id: "JT98XXBcys",
    description: "Label for a guideline violation in the editor QA list",
  },
  limitReached: {
    defaultMessage: "Guideline check limit reached. This translation was not checked.",
    id: "THoL7yb4DX",
    description: "Editor QA warning when the guideline check allowance is used up",
  },
});
