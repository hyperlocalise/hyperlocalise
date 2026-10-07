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

export const automationLeaveGuardMessages = defineMessages({
  title: {
    defaultMessage: "Leave without saving?",
    id: "CrkzTgTZa+",
    description:
      "Title of the dialog shown when the user tries to leave an automation setup page with unsaved changes",
  },
  description: {
    defaultMessage:
      "This automation has changes that are not saved. If you leave now, they will be lost.",
    id: "dsN24mbKQR",
    description:
      "Body of the dialog shown when the user tries to leave an automation setup page with unsaved changes",
  },
  keepEditing: {
    defaultMessage: "Keep editing",
    id: "TB0gZwuSGC",
    description: "Button that closes the unsaved changes dialog and stays on the automation page",
  },
  leave: {
    defaultMessage: "Leave without saving",
    id: "UkvPtQMDuQ",
    description: "Button that leaves the automation setup page and throws away its unsaved changes",
  },
});
