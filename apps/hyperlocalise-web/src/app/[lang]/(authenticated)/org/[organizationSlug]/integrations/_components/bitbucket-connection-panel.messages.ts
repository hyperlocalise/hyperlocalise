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

export const bitbucketConnectionPanelMessages = defineMessages({
  name: {
    defaultMessage: "Bitbucket",
    id: "d5HQ4rkEPj",
    description: "Integration row name for the workspace's Bitbucket Cloud connection",
  },
  description: {
    defaultMessage:
      "Connect Bitbucket Cloud with an API token to sync repository files with your projects.",
    id: "IplAYWnzN2",
    description: "Integration row description for the workspace's Bitbucket connection",
  },
  connectionsDescription: {
    defaultMessage:
      "{count, plural, one {# connection} other {# connections}}. New project syncs use {name}.",
    id: "3IiGBH4O56",
    description:
      "Integrations row description when the workspace has several Bitbucket connections; name is the default connection's name",
  },
  connectedDescription: {
    defaultMessage: "Connected as {account}.",
    id: "Lh6T5t29wY",
    description:
      "Integrations row description of a Bitbucket connection; account is who it acts as",
  },
  connectedAccessToken: {
    defaultMessage: "Connected with a workspace, project or repository access token.",
    id: "NtxJdiszvI",
    description:
      "Integrations row description of a Bitbucket connection made with an access token that doesn't say who it belongs to",
  },
  loadError: {
    defaultMessage: "Bitbucket connections couldn't be loaded. Refresh the page to try again.",
    id: "7JWzL0fYgH",
    description: "Integrations row description when the Bitbucket connections failed to load",
  },
  intro: {
    defaultMessage:
      "Create an API token in your Atlassian account settings with read and write access to repositories and pull requests, then enter it here with your Atlassian account email. A workspace, project or repository access token works too: leave the email empty. A token that can only read pulls files and doesn't open pull requests.",
    id: "02WmrhCvQt",
    description: "Introduction shown when the workspace has no Bitbucket connection",
  },
  addIntro: {
    defaultMessage:
      "Add another connection to give a project's sync a token that only reaches its own repositories.",
    id: "vTI+7YwIJu",
    description: "Hint above the button that adds another Bitbucket connection",
  },
  addConnection: {
    defaultMessage: "Add connection",
    id: "2QvLC+3K5P",
    description: "Button that opens the form to add a Bitbucket connection",
  },
  defaultBadge: {
    defaultMessage: "Default",
    id: "D3t8cnywmB",
    description: "Badge on the Bitbucket connection new project syncs use",
  },
  usedBySyncs: {
    defaultMessage: "Used by {count, plural, one {# project sync} other {# project syncs}}.",
    id: "9SEp04CxuC",
    description: "How many project syncs use a Bitbucket connection",
  },
  checking: {
    defaultMessage: "Checking the token…",
    id: "xVj8zoSOdV",
    description: "Shown while a Bitbucket connection's token is checked",
  },
  checkUnavailable: {
    defaultMessage: "The token couldn't be checked just now.",
    id: "8rVweIsKFa",
    description: "Shown when a Bitbucket connection's check request failed",
  },
  checkFailed: {
    defaultMessage: "This connection isn't working: {reason}",
    id: "2SVgjgtlp1",
    description: "Shown when a Bitbucket connection's token no longer works; reason says why",
  },
  checkPassed: {
    defaultMessage: "Token ending {suffix} works.",
    id: "enG7KbGDgX",
    description: "Shown when a Bitbucket connection's token works; suffix is its last characters",
  },
  tokenReadsNothing: {
    defaultMessage: "It can't read any repository yet.",
    id: "bFkOvyIO2U",
    description: "Warning when a working Bitbucket token can read no repository",
  },
  makeDefault: {
    defaultMessage: "Make default",
    id: "khzvviRW7G",
    description: "Button that makes a Bitbucket connection the workspace's default",
  },
  defaultSaved: {
    defaultMessage: "{name} is now the default Bitbucket connection.",
    id: "L6JZRKZl/n",
    description: "Toast after a Bitbucket connection became the default",
  },
  defaultFailed: {
    defaultMessage: "The default connection couldn't be changed.",
    id: "6kwNWsZcf+",
    description: "Toast when marking a Bitbucket connection as default failed",
  },
  change: {
    defaultMessage: "Change",
    id: "CwwWNKIrNl",
    description: "Button that opens the form to change a Bitbucket connection",
  },
  remove: {
    defaultMessage: "Remove",
    id: "5aMOHljuCT",
    description: "Button that asks to remove a Bitbucket connection",
  },
  removeConfirm: {
    defaultMessage:
      "{count, plural, =0 {Remove this connection?} one {# project sync uses this connection and stops until another is chosen. Remove it?} other {# project syncs use this connection and stop until another is chosen. Remove it?}}",
    id: "Bbvttz43Nz",
    description: "Confirmation before removing a Bitbucket connection",
  },
  removeNow: {
    defaultMessage: "Remove connection",
    id: "CJ/dcP8L98",
    description: "Button that removes a Bitbucket connection after confirmation",
  },
  removing: {
    defaultMessage: "Removing…",
    id: "npaxCXYatK",
    description: "Button label while a Bitbucket connection is removed",
  },
  removed: {
    defaultMessage: "Bitbucket connection removed.",
    id: "RP3etSJgd3",
    description: "Toast after a Bitbucket connection was removed",
  },
  removeFailed: {
    defaultMessage: "The Bitbucket connection couldn't be removed.",
    id: "bGRMREhpJR",
    description: "Toast when removing a Bitbucket connection failed",
  },
  cancel: {
    defaultMessage: "Cancel",
    id: "/intCFl15C",
    description: "Button that closes the Bitbucket connection form or confirmation",
  },
  nameLabel: {
    defaultMessage: "Name",
    id: "paGmakQOxr",
    description: "Label for a Bitbucket connection's name field",
  },
  namePlaceholder: {
    defaultMessage: "Marketing site repositories",
    id: "4qKAjPhJpj",
    description: "Placeholder for a Bitbucket connection's name field",
  },
  nameHint: {
    defaultMessage: "Optional. Shown when a project chooses which connection its sync uses.",
    id: "ncyrDEYGI0",
    description: "Hint under a Bitbucket connection's name field",
  },
  emailLabel: {
    defaultMessage: "Atlassian account email",
    id: "oLpVFGGbnB",
    description: "Label for the email an Atlassian API token belongs to",
  },
  emailHint: {
    defaultMessage:
      "The email of the account that created the API token. Leave empty for a workspace, project or repository access token.",
    id: "fAdgEoJssi",
    description: "Hint under the Bitbucket connection's email field",
  },
  tokenLabel: {
    defaultMessage: "API token",
    id: "vd4trMKy52",
    description: "Label for the Bitbucket API token field",
  },
  tokenHint: {
    defaultMessage:
      "Give it read and write access to repositories and pull requests so syncs can open pull requests.",
    id: "gcZogYjXvb",
    description: "Hint under the Bitbucket API token field",
  },
  tokenReplaceHint: {
    defaultMessage: "Enter the token again, or a new one. The saved token is never shown.",
    id: "U7N0nRz4WS",
    description: "Hint under the Bitbucket API token field when changing a connection",
  },
  showToken: {
    defaultMessage: "Show token",
    id: "9ZLNqjFyj0",
    description: "Button that shows the typed Bitbucket token",
  },
  hideToken: {
    defaultMessage: "Hide token",
    id: "Jf1cQtTjT7",
    description: "Button that hides the typed Bitbucket token",
  },
  replaceWarning: {
    defaultMessage: "Project syncs using this connection keep using it with the new token.",
    id: "40N6Cz4jsc",
    description: "Note in the form that changes a Bitbucket connection",
  },
  save: {
    defaultMessage: "Save and check",
    id: "fVAAyPf4Hj",
    description: "Button that checks and saves a Bitbucket connection",
  },
  saving: {
    defaultMessage: "Checking…",
    id: "w5FVJM90Ev",
    description: "Button label while a Bitbucket connection is checked and saved",
  },
  saved: {
    defaultMessage: "Bitbucket connection saved.",
    id: "Cn1L/dOB3x",
    description: "Toast after a Bitbucket connection was saved",
  },
  saveFailed: {
    defaultMessage: "The Bitbucket connection couldn't be saved.",
    id: "L8SRgFEsi6",
    description: "Toast when saving a Bitbucket connection failed",
  },
});
