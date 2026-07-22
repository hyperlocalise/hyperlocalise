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

export const providerLiveJobDetailContentMessages = defineMessages({
  failedToLoadProviderJob: {
    defaultMessage: "Failed to load provider job ({status})",
    id: "7MZqOWE2cs",
    description: "Error when the live TMS provider job request fails",
  },
  failedToDeleteJob: {
    defaultMessage: "Failed to delete job ({status})",
    id: "2p0kb15yT7",
    description: "Error when deleting a Crowdin task fails with a status code",
  },
  failedToDeleteJobFallback: {
    defaultMessage: "Failed to delete job",
    id: "70dqPfaXJS",
    description: "Toast fallback when deleting a Crowdin task fails without an Error message",
  },
  crowdinTaskDeleted: {
    defaultMessage: "Crowdin task deleted",
    id: "f697pDeGl6",
    description: "Success toast after deleting a Crowdin task",
  },
  deleteCrowdinTaskTitle: {
    defaultMessage: "Delete Crowdin task?",
    id: "tCoNRn2dnG",
    description: "Title of the delete Crowdin task confirmation dialog",
  },
  deleteCrowdinTaskDescription: {
    defaultMessage:
      "This permanently deletes the task in Crowdin. This cannot be undone from Hyperlocalise.",
    id: "DFBLmXNHC6",
    description: "Description in the delete Crowdin task confirmation dialog",
  },
  keepTask: {
    defaultMessage: "Keep task",
    id: "mf6hFW145B",
    description: "Dismiss button in the delete Crowdin task confirmation dialog",
  },
  deleting: {
    defaultMessage: "Deleting…",
    id: "OpaDn2OQOK",
    description: "Confirm button label while deleting a Crowdin task",
  },
  deleteTask: {
    defaultMessage: "Delete task",
    id: "vrYsk4CDa0",
    description: "Confirm button to delete a Crowdin task",
  },
});
