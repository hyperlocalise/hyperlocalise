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

export const nativeJobDueDateFieldMessages = defineMessages({
  dueDateAriaLabel: {
    defaultMessage: "Due date",
    id: "OwekW9l8dU",
    description: "Accessible label for the native job due date input",
  },
  clearDueDate: {
    defaultMessage: "Clear due date",
    id: "LeXC0lX0Wz",
    description: "Accessible label for the button that removes a native job's due date",
  },
  saveSuccess: {
    defaultMessage: "Due date updated",
    id: "e4ecBMTJAg",
    description: "Toast after a native job's due date is saved",
  },
  saveFailed: {
    defaultMessage: "Couldn't update the due date",
    id: "VePDpO3djR",
    description: "Toast when saving a native job's due date fails",
  },
});
