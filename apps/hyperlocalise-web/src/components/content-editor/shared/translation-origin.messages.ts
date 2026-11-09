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

import type { TranslationOrigin } from "@/lib/projects/translations/translation-origin-rule";

/** Labels for a translation's origin: whether a machine or a person wrote it. */
export const translationOriginMessages = defineMessages({
  machine: {
    defaultMessage: "Machine",
    id: "NLcieuA3S2",
    description: "Translation origin: written by a translation job or the agent, or kept unchanged",
  },
  machine_post_edited: {
    defaultMessage: "Machine, post-edited",
    id: "pH1V0RSYlu",
    description: "Translation origin: machine translation that a person then changed",
  },
  human: {
    defaultMessage: "Human",
    id: "3YVMnxAdxJ",
    description: "Translation origin: written by a person",
  },
  unknown: {
    defaultMessage: "Unknown",
    id: "rtRRd7xrp9",
    description: "Translation origin: imported without a record of who wrote it",
  },
} satisfies Record<TranslationOrigin, unknown>);
