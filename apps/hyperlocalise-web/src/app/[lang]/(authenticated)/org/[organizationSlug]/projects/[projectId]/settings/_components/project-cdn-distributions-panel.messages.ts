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

export const projectCdnDistributionsPanelMessages = defineMessages({
  title: {
    defaultMessage: "CDN distributions",
    id: "JUzRcBV1rA",
    description: "Project settings heading for over-the-air CDN distributions",
  },
  description: {
    defaultMessage:
      "Publish approved translations to a public CDN hash. Apps poll the manifest, then fetch locale files. Nothing goes live until you release.",
    id: "X9oKYTr/q8",
    description: "Project settings description for CDN distributions",
  },
  addButton: {
    defaultMessage: "New distribution",
    id: "4qWZZ73pha",
    description: "Button to create a CDN distribution",
  },
  loading: {
    defaultMessage: "Loading distributions…",
    id: "q2SU2pJRak",
    description: "Loading state for CDN distributions",
  },
  loadFailed: {
    defaultMessage: "Could not load CDN distributions.",
    id: "fLEkjXtPgQ",
    description: "Error when CDN distributions fail to load",
  },
  emptyTitle: {
    defaultMessage: "No distributions yet",
    id: "YsnLEzyuRR",
    description: "Empty-state title for CDN distributions",
  },
  emptyDescription: {
    defaultMessage:
      "Create a distribution, pick files and locales, then release a snapshot to the hosted CDN or a workspace S3 bucket.",
    id: "aweugdnJ+2",
    description: "Empty-state description for CDN distributions",
  },
  hostedCdn: {
    defaultMessage: "Hyperlocalise CDN",
    id: "4mrQ4Iw3UG",
    description: "Label for the hosted Hyperlocalise CDN destination",
  },
  released: {
    defaultMessage: "Released {when}",
    id: "pF8ZsPzjLl",
    description: "Relative last-release timestamp for a CDN distribution",
  },
  neverReleased: {
    defaultMessage: "Not released yet",
    id: "42BdLGhs9r",
    description: "Status when a CDN distribution has no successful release",
  },
  revoked: {
    defaultMessage: "Revoked",
    id: "mIBUfamIaw",
    description: "Badge for a revoked CDN distribution",
  },
  release: {
    defaultMessage: "Release",
    id: "O17zsV4ZC8",
    description: "Button to publish a CDN distribution snapshot",
  },
  rotate: {
    defaultMessage: "Rotate hash",
    id: "ObS0tdzBTB",
    description: "Button to mint a new public hash for a CDN distribution",
  },
  revoke: {
    defaultMessage: "Revoke",
    id: "Zy9fSoO9xF",
    description: "Button to revoke a CDN distribution",
  },
  revokeConfirmTitle: {
    defaultMessage: "Revoke this distribution?",
    id: "AtEk3Q1jdM",
    description: "Title of the confirm dialog before revoking a CDN distribution",
  },
  revokeConfirmDescription: {
    defaultMessage:
      "The public URL will start returning 404. Apps still pointing at this hash will stop receiving translations.",
    id: "xeZm85IfG9",
    description: "Explanation shown before revoking a CDN distribution",
  },
  revokeConfirm: {
    defaultMessage: "Revoke",
    id: "aKKkBLHXs8",
    description: "Confirm button in the revoke CDN distribution dialog",
  },
  copyUrl: {
    defaultMessage: "Copy manifest URL",
    id: "VwyLcxtAEG",
    description: "Button to copy the public manifest URL",
  },
  copied: {
    defaultMessage: "Copied",
    id: "CJmTWcLA2W",
    description: "Toast after copying a CDN URL",
  },
  actionFailed: {
    defaultMessage: "That action did not complete.",
    id: "IyhAAjoHew",
    description: "Generic error for CDN distribution actions",
  },
  releasedToast: {
    defaultMessage: "Release published.",
    id: "THNUna+BNU",
    description: "Success toast after publishing a CDN distribution",
  },
  rotatedToast: {
    defaultMessage: "Hash rotated. Update apps that still embed the old URL.",
    id: "NhzwsS1rjr",
    description: "Success toast after rotating a CDN distribution hash",
  },
  revokedToast: {
    defaultMessage: "Distribution revoked. The public URL now returns 404.",
    id: "m58wQ0Ircc",
    description: "Success toast after revoking a CDN distribution",
  },
  createdToast: {
    defaultMessage: "Distribution created. Release it to publish files.",
    id: "SxxDsIOhUO",
    description: "Success toast after creating a CDN distribution",
  },
  dialogTitle: {
    defaultMessage: "New CDN distribution",
    id: "ZudMnt/VFG",
    description: "Title of the create-distribution dialog",
  },
  dialogDescription: {
    defaultMessage: "Choose files, locales, and a destination. Release publishes the snapshot.",
    id: "lGmFnuqBDU",
    description: "Description of the create-distribution dialog",
  },
  nameLabel: {
    defaultMessage: "Name",
    id: "yrv+7jidmf",
    description: "Label for the CDN distribution name field",
  },
  formatLabel: {
    defaultMessage: "Format",
    id: "QNe7QoZgvf",
    description: "Label for the CDN distribution format field",
  },
  filesLabel: {
    defaultMessage: "Source files",
    id: "zgQJSxBdyd",
    description: "Label for selecting files in a CDN distribution",
  },
  localesLabel: {
    defaultMessage: "Locales",
    id: "7CfX7zd8oz",
    description: "Label for selecting locales in a CDN distribution",
  },
  destinationLabel: {
    defaultMessage: "Destination",
    id: "/AapRn595W",
    description: "Label for selecting a CDN destination",
  },
  formatJson: {
    defaultMessage: "JSON",
    id: "+CRu8NfvtB",
    description: "JSON format option for a CDN distribution",
  },
  formatAndroid: {
    defaultMessage: "Android XML",
    id: "KMFSdYMdm6",
    description: "Android XML format option for a CDN distribution",
  },
  formatIos: {
    defaultMessage: "iOS strings",
    id: "hrc7c/O3UO",
    description: "iOS strings format option for a CDN distribution",
  },
  create: {
    defaultMessage: "Create",
    id: "L3NRzfZ3d6",
    description: "Submit button for creating a CDN distribution",
  },
  cancel: {
    defaultMessage: "Cancel",
    id: "EYGyoDkzHT",
    description: "Cancel button for the CDN distribution dialog",
  },
  customDestinationsHint: {
    defaultMessage: "Add a customer S3 bucket in workspace settings.",
    id: "XCC6S4HjMT",
    description: "Hint linking to workspace CDN destination settings",
  },
});
