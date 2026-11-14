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

export const cdnDestinationsPageContentMessages = defineMessages({
  pageTitle: {
    defaultMessage: "CDN destinations",
    id: "LMl88MMoE7",
    description: "Workspace settings page title for custom CDN destinations",
  },
  pageDescription: {
    defaultMessage:
      "Publish OTA snapshots to a customer-owned S3 bucket instead of the Hyperlocalise CDN. We probe the bucket before saving credentials.",
    id: "k/Dt8aRTtb",
    description: "Workspace settings page description for custom CDN destinations",
  },
  addButton: {
    defaultMessage: "Add destination",
    id: "LN67F8WFRm",
    description: "Button to add a custom S3 CDN destination",
  },
  sectionAriaLabel: {
    defaultMessage: "CDN destinations",
    id: "CivmESJtKy",
    description: "Accessible label for the CDN destinations list",
  },
  loading: {
    defaultMessage: "Loading destinations…",
    id: "EbQJKSIxSL",
    description: "Loading state for CDN destinations",
  },
  loadFailed: {
    defaultMessage: "Could not load CDN destinations.",
    id: "2Lzygvm5rp",
    description: "Error when CDN destinations fail to load",
  },
  emptyTitle: {
    defaultMessage: "No custom buckets yet",
    id: "3bMyg1I54K",
    description: "Empty-state title for CDN destinations",
  },
  emptyDescription: {
    defaultMessage:
      "Projects can keep using the hosted Hyperlocalise CDN. Add a destination here when a customer wants releases written to their own infrastructure.",
    id: "WDkSeBnfPB",
    description: "Empty-state description for CDN destinations",
  },
  actionFailed: {
    defaultMessage: "That action did not complete.",
    id: "wiIJ9SjGaR",
    description: "Generic error for CDN destination actions",
  },
  created: {
    defaultMessage: "Destination saved. Projects can select it on a distribution.",
    id: "f1fSWAH3FD",
    description: "Success toast after creating a CDN destination",
  },
  deleted: {
    defaultMessage: "Destination removed.",
    id: "oS6EyXp2Fk",
    description: "Success toast after deleting a CDN destination",
  },
  delete: {
    defaultMessage: "Delete",
    id: "a4JlUjqbC5",
    description: "Button to delete a CDN destination",
  },
  cancel: {
    defaultMessage: "Cancel",
    id: "3LmU5oq/9O",
    description: "Cancel button for CDN destination dialogs",
  },
  create: {
    defaultMessage: "Save destination",
    id: "EQxLGsmJrt",
    description: "Submit button for creating a CDN destination",
  },
  dialogTitle: {
    defaultMessage: "Add S3 destination",
    id: "EfYAxoL2i5",
    description: "Title of the create CDN destination dialog",
  },
  dialogDescription: {
    defaultMessage:
      "Use an IAM user that can HeadBucket, PutObject, GetObject, ListBucket, and DeleteObject on this bucket. Credentials are encrypted at rest.",
    id: "7qkPxRy9iz",
    description: "Description of the create CDN destination dialog",
  },
  nameLabel: {
    defaultMessage: "Name",
    id: "kQwkQeqjNV",
    description: "Label for the CDN destination name",
  },
  bucketLabel: {
    defaultMessage: "Bucket",
    id: "ixzg3e0iqs",
    description: "Label for the S3 bucket name",
  },
  regionLabel: {
    defaultMessage: "Region",
    id: "k/sxw/4XSD",
    description: "Label for the S3 region",
  },
  endpointLabel: {
    defaultMessage: "Endpoint (optional)",
    id: "3G08bynPIU",
    description: "Label for an S3-compatible endpoint URL",
  },
  publicBaseUrlLabel: {
    defaultMessage: "Public base URL",
    id: "xopG8+/q56",
    description: "Label for the public CDN base URL",
  },
  accessKeyLabel: {
    defaultMessage: "Access key ID",
    id: "uVC3GqC453",
    description: "Label for the AWS access key ID",
  },
  secretKeyLabel: {
    defaultMessage: "Secret access key",
    id: "rfMHcX6Nm+",
    description: "Label for the AWS secret access key",
  },
  pathStyleLabel: {
    defaultMessage: "Use path-style URLs",
    id: "Y59kDSR+P+",
    description: "Checkbox label for S3 path-style addressing",
  },
  deleteTitle: {
    defaultMessage: "Delete this destination?",
    id: "ac2NXVMSAs",
    description: "Title of the delete CDN destination confirmation",
  },
  deleteDescription: {
    defaultMessage:
      "Distributions still using this bucket cannot be deleted. Revoke or move them first.",
    id: "Bhmc0ft5LM",
    description: "Description of the delete CDN destination confirmation",
  },
});
