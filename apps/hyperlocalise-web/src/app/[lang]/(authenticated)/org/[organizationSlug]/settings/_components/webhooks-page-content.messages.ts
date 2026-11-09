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

export const webhooksPageContentMessages = defineMessages({
  pageTitle: {
    defaultMessage: "Webhooks",
    id: "SDPV5gwpkL",
    description: "Title of the webhooks settings page",
  },
  pageDescription: {
    defaultMessage:
      "Hyperlocalise sends a signed POST to each endpoint when a job is created, changes status, or is reassigned. Failed deliveries are retried for about a day.",
    id: "AH2+MpTauH",
    description: "Description at the top of the webhooks settings page",
  },
  addButton: {
    defaultMessage: "Add endpoint",
    id: "k0QQ1PVuts",
    description: "Button that opens the dialog to add a webhook endpoint",
  },
  sectionAriaLabel: {
    defaultMessage: "Webhook endpoints",
    id: "mf1cyANUCM",
    description: "Accessible label for the list of webhook endpoints",
  },
  loading: {
    defaultMessage: "Loading endpoints…",
    id: "tkW5GO4WZC",
    description: "Shown while webhook endpoints load",
  },
  loadFailed: {
    defaultMessage: "Could not load webhook endpoints.",
    id: "Y9uN+w96On",
    description: "Error shown when webhook endpoints fail to load",
  },
  emptyTitle: {
    defaultMessage: "No endpoints yet",
    id: "DjXHKF/eLm",
    description: "Title shown when the workspace has no webhook endpoints",
  },
  emptyDescription: {
    defaultMessage: "Add an endpoint to get job updates in your own systems.",
    id: "lCaroPWe8a",
    description: "Description shown when the workspace has no webhook endpoints",
  },
  allEvents: {
    defaultMessage: "All job changes",
    id: "V1PgwPg/Qj",
    description: "Shown for an endpoint that receives every event type",
  },
  statusEnabled: {
    defaultMessage: "Enabled",
    id: "zUTzkuCY8C",
    description: "Badge for an enabled webhook endpoint",
  },
  statusDisabled: {
    defaultMessage: "Disabled",
    id: "OwEU0Kwl34",
    description: "Badge for a disabled webhook endpoint",
  },
  statusAutoDisabled: {
    defaultMessage: "Disabled after repeated failures",
    id: "baC+vfP5oL",
    description: "Badge for a webhook endpoint switched off after failing many times in a row",
  },
  sendTest: {
    defaultMessage: "Send test",
    id: "ML0JU1IYs2",
    description: "Button that sends a test event to a webhook endpoint",
  },
  enable: {
    defaultMessage: "Enable",
    id: "JRW1qm8WII",
    description: "Button that enables a webhook endpoint",
  },
  disable: {
    defaultMessage: "Disable",
    id: "F8wKFkANIN",
    description: "Button that disables a webhook endpoint",
  },
  rotateSecret: {
    defaultMessage: "Rotate secret",
    id: "1cl5eWnQmi",
    description: "Button that replaces a webhook endpoint's signing secret",
  },
  delete: {
    defaultMessage: "Delete",
    id: "I6puvrJ0Im",
    description: "Button that deletes a webhook endpoint",
  },
  showDeliveries: {
    defaultMessage: "Recent deliveries",
    id: "AbJU2V5Jr4",
    description: "Button that shows the recent deliveries of a webhook endpoint",
  },
  hideDeliveries: {
    defaultMessage: "Hide deliveries",
    id: "k4mOocaHXm",
    description: "Button that hides the recent deliveries of a webhook endpoint",
  },
  noDeliveries: {
    defaultMessage: "Nothing sent yet.",
    id: "MIDI/Oh5zT",
    description: "Shown when a webhook endpoint has no deliveries",
  },
  deliveryAttempts: {
    defaultMessage: "{count, plural, one {# attempt} other {# attempts}}",
    id: "q6THw9gW0+",
    description: "Number of attempts made for one webhook delivery",
  },
  deliverySucceeded: {
    defaultMessage: "Delivered",
    id: "kP+iWP1ZIP",
    description: "Status of a webhook delivery that succeeded",
  },
  deliveryPending: {
    defaultMessage: "Retrying",
    id: "IwYDKgaQgi",
    description: "Status of a webhook delivery waiting for another attempt",
  },
  deliveryFailed: {
    defaultMessage: "Failed",
    id: "DaQjpTr9aL",
    description: "Status of a webhook delivery that failed for good",
  },
  testSucceeded: {
    defaultMessage: "Test event delivered.",
    id: "hoakqYsbr6",
    description: "Toast after a test webhook event is delivered",
  },
  testFailed: {
    defaultMessage: "Test event failed: {reason}",
    id: "ERGECKyMdD",
    description: "Toast after a test webhook event fails, with a short error code",
  },
  actionFailed: {
    defaultMessage: "Something went wrong. Try again.",
    id: "PmG/4bTauY",
    description: "Generic toast when a webhook endpoint action fails",
  },
  createDialogTitle: {
    defaultMessage: "Add webhook endpoint",
    id: "EK98wA5/s7",
    description: "Title of the dialog that adds a webhook endpoint",
  },
  createDialogDescription: {
    defaultMessage:
      "Use an HTTPS URL on a public host. Leave every change unticked to receive all of them.",
    id: "rEY6WLCBSc",
    description: "Description of the dialog that adds a webhook endpoint",
  },
  urlLabel: {
    defaultMessage: "Endpoint URL",
    id: "1nE10owktS",
    description: "Label for the webhook endpoint URL field",
  },
  descriptionLabel: {
    defaultMessage: "Description",
    id: "CluVavzlk9",
    description: "Label for the optional webhook endpoint description field",
  },
  eventsLabel: {
    defaultMessage: "Job changes",
    id: "17X5du4fQ1",
    description: "Label above the event type checkboxes when adding a webhook endpoint",
  },
  eventCreated: {
    defaultMessage: "Job created",
    id: "ngKtCPyOee",
    description: "Event type checkbox for job.created webhooks",
  },
  eventStatusChanged: {
    defaultMessage: "Status changed",
    id: "UszH0kWuRQ",
    description: "Event type checkbox for job.status_changed webhooks",
  },
  eventAssigneeChanged: {
    defaultMessage: "Assignee changed",
    id: "AWDYKHksqH",
    description: "Event type checkbox for job.assignee_changed webhooks",
  },
  cancel: {
    defaultMessage: "Cancel",
    id: "GKZSZqnivG",
    description: "Cancel button in webhook dialogs",
  },
  create: {
    defaultMessage: "Add endpoint",
    id: "yzMoCz6Bfe",
    description: "Submit button in the dialog that adds a webhook endpoint",
  },
  creating: {
    defaultMessage: "Adding…",
    id: "CiXaHf0N/j",
    description: "Submit button label while a webhook endpoint is being added",
  },
  secretDialogTitle: {
    defaultMessage: "Signing secret",
    id: "LdX11hDGkn",
    description: "Title of the dialog that shows a webhook signing secret once",
  },
  secretDialogDescription: {
    defaultMessage:
      "Copy this secret now; it will not be shown again. Use it to check the webhook-signature header on each request.",
    id: "58CkPn5dyT",
    description: "Description of the dialog that shows a webhook signing secret once",
  },
  copy: {
    defaultMessage: "Copy",
    id: "1iXDNHE3jG",
    description: "Button that copies the webhook signing secret",
  },
  copied: {
    defaultMessage: "Copied",
    id: "g2bWZ/8g5i",
    description: "Button label after the webhook signing secret is copied",
  },
  copyFailed: {
    defaultMessage: "Could not copy the secret.",
    id: "cKuOYFO8W2",
    description: "Toast when copying the webhook signing secret fails",
  },
  done: {
    defaultMessage: "Done",
    id: "ar9H1OA/pE",
    description: "Button that closes the webhook signing secret dialog",
  },
  deleteDialogTitle: {
    defaultMessage: "Delete this endpoint?",
    id: "c2gGM7FI2X",
    description: "Title of the dialog that confirms deleting a webhook endpoint",
  },
  deleteDialogDescription: {
    defaultMessage: "It stops receiving events at once, and its delivery history is removed.",
    id: "7hn7lpQ8FF",
    description: "Description of the dialog that confirms deleting a webhook endpoint",
  },
  deleted: {
    defaultMessage: "Endpoint deleted.",
    id: "udK74uH/OP",
    description: "Toast after a webhook endpoint is deleted",
  },
});
