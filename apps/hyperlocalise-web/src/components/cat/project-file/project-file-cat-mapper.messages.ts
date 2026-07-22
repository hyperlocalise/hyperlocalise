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

export const projectFileCatMapperMessages = defineMessages({
  placeholdersAndIcuLabel: {
    defaultMessage: "Placeholders & ICU",
    id: "5mXIwOpOHZ",
    description: "CAT format check label when the source has placeholders or ICU structure",
  },
  formatLabel: {
    defaultMessage: "Format",
    id: "jRn12WvzpR",
    description: "CAT format check label when the source has no placeholders or ICU",
  },
  placeholdersPassMessage: {
    defaultMessage: "Target keeps the required placeholders and ICU structure.",
    id: "DBygjYGTST",
    description: "CAT format check pass message when placeholders and ICU match the source",
  },
  noPlaceholdersMessage: {
    defaultMessage: "No placeholders or ICU blocks detected.",
    id: "pG8ohlGkX1",
    description: "CAT format check pass message when the source has no placeholders or ICU",
  },
  lengthLabel: {
    defaultMessage: "Length",
    id: "OfQ4bwN572",
    description: "CAT format check label when the translation exceeds the max length",
  },
  lengthExceededMessage: {
    defaultMessage: "Translation exceeds {maxLength} characters.",
    id: "2n+HKSvXeZ",
    description: "CAT format check message when the target is longer than the allowed max length",
  },
  fileIntent: {
    defaultMessage: "Translate {filename} into {targetLocale}.",
    id: "N3sBMgFSjL",
    description: "Default CAT intelligence intent describing the file being translated",
  },
  segmentIntent: {
    defaultMessage: "Translate {key} into {targetLocale}.",
    id: "uGTkmY72ps",
    description: "Default CAT intelligence intent describing the segment key being translated",
  },
  approveWritesToProvider: {
    defaultMessage: "Approve writes the current target text back to the provider.",
    id: "rHf60kRYZf",
    description: "Reviewer preference note when approve syncs translations to a TMS provider",
  },
  approveSavesTarget: {
    defaultMessage: "Approve saves the current target text.",
    id: "LzpAaA7wng",
    description: "Reviewer preference note when approve saves translations for a native project",
  },
  readOnlyRolePreference: {
    defaultMessage: "This role can inspect strings but cannot write translations back.",
    id: "K3dTcxv8UP",
    description: "Reviewer preference note when the user cannot edit translations",
  },
  moreStringsAvailable: {
    defaultMessage: "More strings are available beyond this page.",
    id: "YzOH49WD50",
    description: "Constraint note when the CAT queue page is truncated",
  },
  saveToProvider: {
    defaultMessage: "Save to provider",
    id: "7rANseAJ23",
    description: "Primary CAT action label when saving translations back to a TMS provider",
  },
  approve: {
    defaultMessage: "Approve",
    id: "qVnuTIqV5f",
    description: "Primary CAT action label when approving a translation in a native project",
  },
  missingProviderFileId: {
    defaultMessage: "Cannot save translation because the provider file identifier is missing.",
    id: "xMon4OObQB",
    description: "Error when a CAT save cannot resolve the TMS provider file identifier",
  },
});
