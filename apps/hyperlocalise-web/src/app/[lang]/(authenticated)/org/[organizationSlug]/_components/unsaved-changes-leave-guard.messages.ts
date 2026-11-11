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

export const unsavedChangesLeaveGuardMessages = defineMessages({
  title: {
    defaultMessage: "Leave without saving?",
    id: "OvsW5vUzUg",
    description:
      "Title of the dialog shown when the user tries to leave a page with unsaved changes",
  },
  description: {
    defaultMessage:
      "This page has changes that are not saved. If you leave now, they will be lost.",
    id: "bdFq+TlEbd",
    description:
      "Body of the dialog shown when the user tries to leave a page with unsaved changes",
  },
  keepEditing: {
    defaultMessage: "Keep editing",
    id: "zIhD8Y76tZ",
    description: "Button that closes the unsaved changes dialog and stays on the page",
  },
  leave: {
    defaultMessage: "Leave without saving",
    id: "MAhf92hF3b",
    description: "Button that leaves the page and throws away its unsaved changes",
  },
});
