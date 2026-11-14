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

export const contentEditorQaSaveOverrideDialogMessages = defineMessages({
  title: {
    defaultMessage: "Save with QA errors?",
    id: "KQSjQHTSn1",
    description: "Title of the dialog shown when QA error checks fail on a translation save",
  },
  description: {
    defaultMessage:
      "These checks failed. If a check is wrong, you can save anyway. The issues stay in the QA panel.",
    id: "t54W8pdyKg",
    description: "Body of the dialog that lets a translator save despite failing QA error checks",
  },
  cancel: {
    defaultMessage: "Keep editing",
    id: "UCuOOluaJU",
    description: "Button that closes the QA override dialog without saving",
  },
  confirm: {
    defaultMessage: "Save anyway",
    id: "ohJ07hZxMs",
    description: "Button that saves a translation despite failing QA error checks",
  },
});
