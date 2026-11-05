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

export const gitlabServerConnectionPanelMessages = defineMessages({
  name: {
    defaultMessage: "GitLab",
    id: "OXAVWnTukA",
    description:
      "Integration row name for the workspace's GitLab connection, GitLab.com or its own server",
  },
  description: {
    defaultMessage:
      "Connect GitLab.com or your company's own GitLab server for the whole workspace.",
    id: "wkxyIAleHa",
    description: "Integration row description for the workspace's GitLab connection",
  },
  connectionsDescription: {
    defaultMessage:
      "{count, plural, one {# connection} other {# connections}}. Chat and automations use {name}.",
    id: "mQ+9Xns9qF",
    description:
      "Integrations row description when the workspace has several GitLab connections; name is the default connection's name",
  },
  nameLabel: {
    defaultMessage: "Name",
    id: "vcWN5oIVkw",
    description: "Label for a GitLab connection's name field",
  },
  namePlaceholder: {
    defaultMessage: "for example Website repositories",
    id: "afHUN4SiZD",
    description: "Placeholder for a GitLab connection's name field",
  },
  nameHint: {
    defaultMessage: "Shown wherever a project picks a connection to sync with.",
    id: "9OjG8oVPqZ",
    description: "Hint under a GitLab connection's name field",
  },
  addConnection: {
    defaultMessage: "Add connection",
    id: "k1OeGxmTdJ",
    description: "Button that opens the form for another GitLab connection",
  },
  addIntro: {
    defaultMessage:
      "A project can sync with any of these connections; chat and automations use the default one. Add one with a token scoped to the repositories it should reach.",
    id: "cu5L6vnd2u",
    description: "Explains why a workspace might add a second GitLab connection",
  },
  change: {
    defaultMessage: "Change",
    id: "i1Z46jIiYF",
    description: "Button that opens the form to change one GitLab connection",
  },
  makeDefault: {
    defaultMessage: "Use for chat and automations",
    id: "BBsS8wxmqc",
    description: "Button that marks one GitLab connection as the workspace's default",
  },
  defaultBadge: {
    defaultMessage: "Default",
    id: "16jzdfV84U",
    description: "Badge on the GitLab connection that chat and automations use",
  },
  defaultSaved: {
    defaultMessage: "Chat and automations now use {name}.",
    id: "LQPCUXFTmO",
    description: "Toast after marking a GitLab connection as the default",
  },
  defaultFailed: {
    defaultMessage: "Unable to change the default GitLab connection.",
    id: "y1usr5qWfu",
    description: "Toast when marking a GitLab connection as the default fails",
  },
  usedBySyncs: {
    defaultMessage: "Used by {count, plural, one {# project sync} other {# project syncs}}.",
    id: "yJtQmL9RYq",
    description: "How many project syncs run with a GitLab connection",
  },
  remove: {
    defaultMessage: "Remove",
    id: "CEvOadGE6K",
    description: "Button that starts removing one GitLab connection",
  },
  removeConfirm: {
    defaultMessage:
      "Removing this connection affects everyone in the workspace. {count, plural, =0 {} one {# project sync uses it and will stop until it is given another connection.} other {# project syncs use it and will stop until they are given another connection.}}",
    id: "HxWOvKpnhC",
    description:
      "Asks for confirmation before removing a GitLab connection, with how many project syncs use it",
  },
  removeNow: {
    defaultMessage: "Remove connection",
    id: "GqszOf+J5n",
    description: "Button that removes a GitLab connection after confirmation",
  },
  removing: {
    defaultMessage: "Removing…",
    id: "r2eGswphgY",
    description: "Button text while a GitLab connection is being removed",
  },
  removed: {
    defaultMessage: "GitLab connection removed.",
    id: "/ayzi+h3Zt",
    description: "Toast after a GitLab connection is removed",
  },
  removeFailed: {
    defaultMessage: "Unable to remove the GitLab connection.",
    id: "33J0ngE9lx",
    description: "Toast when removing a GitLab connection fails",
  },
  connectedDescription: {
    defaultMessage: "Connected to {serverUrl} as {username}.",
    id: "TYbrzdSaf3",
    description: "Integration row description once a GitLab server is connected",
  },
  loadError: {
    defaultMessage: "Unable to load the GitLab connection right now.",
    id: "e1JYqjH071",
    description: "Integration row description when the connection fails to load",
  },
  checkFailed: {
    defaultMessage: "This connection isn't working: {reason}",
    id: "QD3uzJ+zZ8",
    description: "Shown when the saved GitLab server connection fails a live check",
  },
  checkUnavailable: {
    defaultMessage: "Couldn't check this connection just now.",
    id: "f28BtwGbZV",
    description: "Shown when the live check of a saved GitLab server connection can't run",
  },
  checking: {
    defaultMessage: "Checking the connection…",
    id: "tuNTrXyvA1",
    description: "Shown while the saved GitLab server connection is being checked",
  },
  checkPassed: {
    defaultMessage: "The connection is working. Token ending in {suffix}.",
    id: "9Tey3vfO9H",
    description: "Shown when the saved GitLab server connection passes a live check",
  },
  intro: {
    defaultMessage:
      "Everyone in this workspace uses these connections' projects: chat and automations use the default one, and each project's sync picks one. Each reaches whatever its token can reach. Members' own GitLab.com sign-ins are not used while any exist.",
    id: "8XlU68Tzsj",
    description: "Explains the effect of connecting GitLab for the workspace",
  },
  replaceWarning: {
    defaultMessage:
      "Project syncs that use this connection follow the change. If this is the default, automations name a project by its path, so pointing it at another server moves them too, and chats stop using projects from the old one.",
    id: "MUf7zMkumb",
    description: "Warning shown before replacing or removing a GitLab server connection",
  },
  hostLabel: {
    defaultMessage: "Connect to",
    id: "DGiD4orSjR",
    description: "Label for the choice between GitLab.com and a company's own GitLab server",
  },
  hostPlaceholder: {
    defaultMessage: "Choose…",
    id: "29x/gSNhzG",
    description: "Placeholder of the GitLab.com or company server choice before one is made",
  },
  hostGitLabCom: {
    defaultMessage: "GitLab.com",
    id: "O2+CxE1DPu",
    description: "Choice: the public GitLab.com service",
  },
  hostServer: {
    defaultMessage: "Your company's GitLab server",
    id: "P1sxklxMwY",
    description: "Choice: a GitLab server the customer runs",
  },
  serverUrlLabel: {
    defaultMessage: "Server address",
    id: "huT2nYeusR",
    description: "Label for the GitLab server address field",
  },
  tokenLabel: {
    defaultMessage: "Access token",
    id: "Xs0BVKJ7dk",
    description: "Label for the GitLab access token field",
  },
  tokenHint: {
    defaultMessage:
      "Use a token from a non-admin user, with the api scope to send merge requests; with read_api and read_repository only, syncs pull and say translations weren't sent. Set an expiry.",
    id: "uRNHIi1M/k",
    description: "Hint describing which access token to create on a company's own GitLab server",
  },
  tokenHintGitLabCom: {
    defaultMessage:
      "Use a project or group access token, or a dedicated account that belongs only to the projects to sync: everyone here reaches what the token reaches. Scopes: api to send merge requests; with read_api and read_repository only, syncs pull and say translations weren't sent. Set an expiry.",
    id: "LZe2ex/5iP",
    description: "Hint describing which access token to create on GitLab.com",
  },
  tokenReplaceHint: {
    defaultMessage: "Enter the token again to change anything here.",
    id: "pOhsACmi7A",
    description: "Hint explaining that saving always needs the token",
  },
  showToken: {
    defaultMessage: "Show access token",
    id: "b88FiiRWt1",
    description: "Accessible label for the button that reveals the GitLab token",
  },
  hideToken: {
    defaultMessage: "Hide access token",
    id: "xSVItdTlw0",
    description: "Accessible label for the button that hides the GitLab token",
  },
  save: {
    defaultMessage: "Check and save",
    id: "C7GU6qexsm",
    description: "Button that checks and saves a GitLab server connection",
  },
  saving: {
    defaultMessage: "Checking…",
    id: "WC0JBz+4vU",
    description: "Button label while a GitLab server connection is being checked",
  },
  saved: {
    defaultMessage: "GitLab connection saved.",
    id: "C0fLYasN09",
    description: "Toast after a GitLab server connection is saved",
  },
  saveFailed: {
    defaultMessage: "Unable to save the GitLab connection.",
    id: "Gz+qUGue0p",
    description: "Toast when saving a GitLab server connection fails without a reason",
  },
  cancel: {
    defaultMessage: "Cancel",
    id: "McapxvtDwd",
    description: "Button that keeps the GitLab server connection",
  },
  gitlabComSignInName: {
    defaultMessage: "GitLab.com sign-in",
    id: "VoQIrWE/6m",
    description: "Name of the per-member GitLab.com sign-in row on the integrations page",
  },
  gitlabComSignIn: {
    defaultMessage:
      "Your own GitLab.com account, for chat and for automations you create. To sync files, connect GitLab for the workspace above.",
    id: "r0YvO5Z1tm",
    description:
      "Description of the per-member GitLab.com sign-in row, shown while the workspace has no GitLab connection",
  },
  gitlabComNotUsed: {
    defaultMessage:
      "Not used while GitLab is connected for the workspace. Disconnect it here to remove your sign-in.",
    id: "nqiSfq5i+m",
    description:
      "Description of a member's own GitLab.com sign-in row while the workspace has a GitLab connection",
  },
});
