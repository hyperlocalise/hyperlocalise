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

export const projectIssueColumnsSettingsMessages = defineMessages({
  title: {
    defaultMessage: "Issue columns",
    id: "ng9pGPnTZ/",
    description: "Heading for the project issue columns settings section",
  },
  description: {
    defaultMessage:
      "Configure fields shown on issues in this project. Hidden fields keep their values.",
    id: "Nywsookzn6",
    description: "Description for the project issue columns settings section",
  },
  systemTitle: {
    defaultMessage: "System",
    id: "BgwxUGlOoU",
    description: "Heading for core system issue fields",
  },
  systemDescription: {
    defaultMessage: "These fields are always available on issues.",
    id: "CE2lOIg1r+",
    description: "Description for core system issue fields",
  },
  builtInTitle: {
    defaultMessage: "Built-in",
    id: "od4AanOJNW",
    description: "Heading for seeded built-in issue columns",
  },
  customTitle: {
    defaultMessage: "Custom",
    id: "pEbaKtKcj3",
    description: "Heading for user-created custom issue columns",
  },
  builtInBadge: {
    defaultMessage: "Built-in",
    id: "BoSN5gM5EB",
    description: "Badge for built-in issue columns",
  },
  customBadge: {
    defaultMessage: "Custom",
    id: "JHFSIHw0S8",
    description: "Badge for custom issue columns",
  },
  loading: {
    defaultMessage: "Loading columns...",
    id: "1XhleWdrNP",
    description: "Loading state for issue columns settings",
  },
  loadError: {
    defaultMessage: "Failed to load issue columns.",
    id: "Z0zZRENUvf",
    description: "Error state when issue columns fail to load",
  },
  emptyCustom: {
    defaultMessage: "No custom columns yet.",
    id: "5jQwn2vYQM",
    description: "Empty state when the project has no custom columns",
  },
  addColumn: {
    defaultMessage: "Add column",
    id: "bc/4smjeQZ",
    description: "Button to add a custom issue column",
  },
  rename: {
    defaultMessage: "Rename",
    id: "IH9MgEJ3zF",
    description: "Button to rename an issue column",
  },
  editOptions: {
    defaultMessage: "Edit options",
    id: "8nhfCkb631",
    description: "Button to edit select options for an issue column",
  },
  show: {
    defaultMessage: "Show",
    id: "PIElwfqIXr",
    description: "Accessibility label to show a hidden issue column",
  },
  hide: {
    defaultMessage: "Hide",
    id: "kLjTn4JPez",
    description: "Accessibility label to hide an issue column",
  },
  moveUp: {
    defaultMessage: "Move up",
    id: "k8haXRuhS3",
    description: "Button to move an issue column earlier in sort order",
  },
  moveDown: {
    defaultMessage: "Move down",
    id: "IVUthO1+r5",
    description: "Button to move an issue column later in sort order",
  },
  delete: {
    defaultMessage: "Delete",
    id: "eWt/E3rn/c",
    description: "Button to delete a custom issue column",
  },
  deleteTitle: {
    defaultMessage: "Delete column?",
    id: "SlLtLEkppm",
    description: "Title for delete issue column confirmation dialog",
  },
  deleteDescription: {
    defaultMessage:
      "Delete “{label}”? Values stored for this column on existing issues will be removed.",
    id: "fZ6vM82PvA",
    description: "Description for delete issue column confirmation dialog",
  },
  cancel: {
    defaultMessage: "Cancel",
    id: "3DGUvjJg6U",
    description: "Cancel button for issue column dialogs",
  },
  deleting: {
    defaultMessage: "Deleting...",
    id: "zGwBrW7HVT",
    description: "Delete button label while deleting an issue column",
  },
  save: {
    defaultMessage: "Save",
    id: "/VCDNxDquX",
    description: "Save button for issue column edit dialogs",
  },
  saving: {
    defaultMessage: "Saving...",
    id: "8Uj/LcQ4Dh",
    description: "Save button label while saving an issue column",
  },
  renameTitle: {
    defaultMessage: "Rename column",
    id: "7gM4E5eO9R",
    description: "Title for rename issue column dialog",
  },
  iconField: {
    defaultMessage: "Icon",
    id: "Wt0qOYiWFy",
    description: "Icon field for a custom issue column",
  },
  labelField: {
    defaultMessage: "Label",
    id: "z5qDgQyncE",
    description: "Label field for an issue column",
  },
  keyField: {
    defaultMessage: "Key",
    id: "Uq3Txt1tW6",
    description: "Key field for a new issue column",
  },
  typeField: {
    defaultMessage: "Type",
    id: "8Fr9Wuahxt",
    description: "Type field for a new issue column",
  },
  optionsField: {
    defaultMessage: "Options (comma-separated)",
    id: "6fr/i0ftu1",
    description: "Options field for a select issue column",
  },
  createTitle: {
    defaultMessage: "Add column",
    id: "RX7jcy2gor",
    description: "Title for create issue column dialog",
  },
  create: {
    defaultMessage: "Create",
    id: "EMwUmCsnLL",
    description: "Submit button for create issue column dialog",
  },
  creating: {
    defaultMessage: "Creating...",
    id: "GQCiwmNekJ",
    description: "Submit button label while creating an issue column",
  },
  editOptionsTitle: {
    defaultMessage: "Edit options",
    id: "vwPIIQYtBh",
    description: "Title for edit select options dialog",
  },
  typeText: {
    defaultMessage: "Text",
    id: "8CUaNB5YrW",
    description: "Issue column type label for text",
  },
  typeLongText: {
    defaultMessage: "Long text",
    id: "DtVOLEpfXB",
    description: "Issue column type label for long text",
  },
  typeSelect: {
    defaultMessage: "Select",
    id: "x7Zo60FQJD",
    description: "Issue column type label for select",
  },
  typeUser: {
    defaultMessage: "User",
    id: "4rjsoyM0nm",
    description: "Issue column type label for user",
  },
  typeEnrichment: {
    defaultMessage: "Enrichment",
    id: "ZG+BNMFwQl",
    description: "Issue column type label for enrichment",
  },
  toastCreated: {
    defaultMessage: "Column created",
    id: "98krmAHTt0",
    description: "Toast after creating an issue column",
  },
  toastUpdated: {
    defaultMessage: "Column updated",
    id: "VQrFBtzNZC",
    description: "Toast after updating an issue column",
  },
  toastDeleted: {
    defaultMessage: "Column deleted",
    id: "sWeXphmV4h",
    description: "Toast after deleting an issue column",
  },
  toastReordered: {
    defaultMessage: "Column order saved",
    id: "ap7pcG+5Mr",
    description: "Toast after reordering issue columns",
  },
  toastHidden: {
    defaultMessage: "Column hidden",
    id: "TGxX41HjAL",
    description: "Toast after hiding an issue column",
  },
  toastShown: {
    defaultMessage: "Column shown",
    id: "KzbmFnFtRO",
    description: "Toast after showing an issue column",
  },
  toastError: {
    defaultMessage: "Unable to update columns",
    id: "BlBj/2poZ0",
    description: "Toast when an issue column mutation fails",
  },
});
