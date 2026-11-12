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

export const projectBranchesPageContentMessages = defineMessages({
  title: {
    defaultMessage: "Branches",
    id: "rIMg0qblB4",
    description: "Page heading for native project version branches",
  },
  description: {
    defaultMessage:
      "Version branches copy files and strings, like Phrase Strings. Sync from the parent, then merge when the work is ready.",
    id: "fHHK+KSHKf",
    description: "Page description for native project version branches",
  },
  nameLabel: {
    defaultMessage: "Name",
    id: "uxXHx7U2bb",
    description: "Label for the new branch name field",
  },
  titleLabel: {
    defaultMessage: "Title",
    id: "Xq0jiOG2eY",
    description: "Label for the optional branch title field",
  },
  baseLabel: {
    defaultMessage: "Copy from",
    id: "PVGWkq3I0n",
    description: "Label for the branch to clone from",
  },
  createAction: {
    defaultMessage: "Create branch",
    id: "fGJUuFZlem",
    description: "Button that creates a native version branch",
  },
  defaultBadge: {
    defaultMessage: "Default",
    id: "LGcKkLmwVD",
    description: "Badge on the default native version branch",
  },
  protectedBadge: {
    defaultMessage: "Protected",
    id: "01DpQsWZLJ",
    description: "Badge on a protected native version branch",
  },
  mergedBadge: {
    defaultMessage: "Merged",
    id: "r5eYlj7f/E",
    description: "Badge on a merged native version branch",
  },
  fileCount: {
    defaultMessage: "{fileCount, plural, one {# file} other {# files}}",
    id: "lbkT+Biigf",
    description: "File count for a version branch",
  },
  keyCount: {
    defaultMessage: "{keyCount, plural, one {# key} other {# keys}}",
    id: "ajcBcq8Pv2",
    description: "Key count for a version branch",
  },
  protectLabel: {
    defaultMessage: "Protect",
    id: "nQ1pOfqJLC",
    description: "Switch label that blocks writes to a version branch",
  },
  syncAction: {
    defaultMessage: "Sync",
    id: "5gRvyUpYhK",
    description: "Button that copies parent branch changes into this branch",
  },
  mergeAction: {
    defaultMessage: "Merge",
    id: "hNZqDH0mYu",
    description: "Button that merges this branch into its parent",
  },
  deleteAction: {
    defaultMessage: "Delete",
    id: "7x2pJbn0qz",
    description: "Button that deletes a version branch",
  },
  mergeTitle: {
    defaultMessage: "Merge {name}",
    id: "URfWRxMM/2",
    description: "Dialog title when merging a version branch",
  },
  mergeUseBranch: {
    defaultMessage: "Keep this branch on conflicts",
    id: "Py1OVLFXEL",
    description: "Merge strategy that prefers the source branch",
  },
  mergeUseBase: {
    defaultMessage: "Keep the parent on conflicts",
    id: "/Lmba3WEqR",
    description: "Merge strategy that prefers the parent branch",
  },
  mergeAdded: {
    defaultMessage: "{added, plural, one {# added} other {# added}}",
    id: "bK4Ihz8eud",
    description: "Count of keys added when merging a version branch",
  },
  mergeChanged: {
    defaultMessage: "{changed, plural, one {# changed} other {# changed}}",
    id: "4axUCv8KyM",
    description: "Count of keys changed when merging a version branch",
  },
  mergeConflicted: {
    defaultMessage: "{conflicted, plural, one {# conflicted} other {# conflicted}}",
    id: "25lMTlAxGm",
    description: "Count of conflicting keys when merging a version branch",
  },
  confirmMerge: {
    defaultMessage: "Merge branch",
    id: "td2ZBe1oRB",
    description: "Confirm button in the merge dialog",
  },
  cancel: {
    defaultMessage: "Cancel",
    id: "k6O7Ly9fi8",
    description: "Cancel button in the merge dialog",
  },
  createSuccess: {
    defaultMessage: "Created {name}",
    id: "uCMCJhcwPt",
    description: "Toast after creating a version branch",
  },
  mergeSuccess: {
    defaultMessage: "Merged {name}",
    id: "MzfREch3Lh",
    description: "Toast after merging a version branch",
  },
  syncSuccess: {
    defaultMessage: "Synced {name}",
    id: "s3kobLkcTu",
    description: "Toast after syncing a version branch",
  },
  deleteSuccess: {
    defaultMessage: "Deleted {name}",
    id: "Z/7R8tGL/5",
    description: "Toast after deleting a version branch",
  },
  loadFailed: {
    defaultMessage: "Could not load branches.",
    id: "GXW9eoJ4Xx",
    description: "Error when version branches fail to load",
  },
  empty: {
    defaultMessage: "This project has no version branches yet.",
    id: "1vB/i99O9s",
    description: "Empty state before the default branch is created",
  },
  providerUnavailable: {
    defaultMessage: "Version branches are available on native projects.",
    id: "bJhCJCWUxf",
    description: "Message when opening branches on a connected TMS project",
  },
});
