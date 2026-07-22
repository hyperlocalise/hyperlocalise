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

export const providerJobDescriptionFieldMessages = defineMessages({
  noDescription: {
    defaultMessage: "No description",
    id: "spGomVccm5",
    description: "Empty state when a provider job has no description",
  },
  editAriaLabel: {
    defaultMessage: "Edit description",
    id: "jyIUsQefkI",
    description: "Accessible label for the button that edits a job description",
  },
  saving: {
    defaultMessage: "Saving…",
    id: "EY7508Falv",
    description: "Button label while a job description save is in progress",
  },
  saveDescription: {
    defaultMessage: "Save description",
    id: "fNe2j52ZZs",
    description: "Button label to save an edited job description",
  },
  reset: {
    defaultMessage: "Reset",
    id: "secVzHMFB2",
    description: "Button to reset an edited job description to the saved value",
  },
  cancel: {
    defaultMessage: "Cancel",
    id: "WeOiVualPW",
    description: "Button to cancel editing a job description",
  },
  saveSuccess: {
    defaultMessage: "Description saved",
    id: "MDFHda6r2V",
    description: "Toast after a job description is saved successfully",
  },
  saveFailedFallback: {
    defaultMessage: "Failed to save description",
    id: "dWtFeDmgHv",
    description: "Fallback toast when saving a job description fails without a message",
  },
  saveFailedWithStatus: {
    defaultMessage: "Failed to save description ({status})",
    id: "jASVM8wdeJ",
    description: "Error when saving a job description fails with an HTTP status",
  },
});
