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

export const contentSyncCardMessages = defineMessages({
  title: {
    defaultMessage: "Content sync",
    id: "3CMhz0O70x",
    description: "Content sync card title on Automations",
  },
  description: {
    defaultMessage:
      "Move source files into this project and write ready translations back. No prompt required.",
    id: "rqKQ19f7kE",
    description: "Content sync card description",
  },
  orgDescription: {
    defaultMessage:
      "Project content syncs move files between a connected source and one Hyperlocalise project.",
    id: "IeNzfp4aLj",
    description: "Content sync card description on the org automations page",
  },
  add: {
    defaultMessage: "Add content sync",
    id: "kaCV+wVrsO",
    description: "Open the add content sync sheet",
  },
  connectFirst: {
    defaultMessage: "Connect a source in Integrations first.",
    id: "cZWsBhk2ee",
    description: "Empty state when no GitHub or CMS connection exists",
  },
  connect: {
    defaultMessage: "Connect",
    id: "nMgCp4t1y/",
    description: "Link to Integrations",
  },
  empty: {
    defaultMessage: "No content syncs yet. Add one to keep a folder or CMS in this project.",
    id: "o1TJSGdz7j",
    description: "Empty content sync list",
  },
  provider: {
    defaultMessage: "Source",
    id: "OL7E13SfCy",
    description: "Provider field label",
  },
  resource: {
    defaultMessage: "Resource",
    id: "bM4iJBgaAJ",
    description: "Repo or space picker label",
  },
  providerFolder: {
    defaultMessage: "Provider folder",
    id: "wVlAdEk4ZC",
    description: "Folder on GitHub/GitLab",
  },
  projectFolder: {
    defaultMessage: "Project folder",
    id: "spDKNrzwQo",
    description: "Folder inside the Hyperlocalise project",
  },
  syncNow: {
    defaultMessage: "Sync now",
    id: "+YoX875s0d",
    description: "Manual content sync action",
  },
  enable: {
    defaultMessage: "Sync content",
    id: "liYAGLhQLJ",
    description: "Enable switch label",
  },
  lastRunFailed: {
    defaultMessage: "Last sync failed",
    id: "/ocvKucgs3",
    description: "Failed last-run badge",
  },
  saveSuccess: {
    defaultMessage: "Content sync saved",
    id: "pgT61uv1SZ",
    description: "Toast after creating a content sync",
  },
  saveError: {
    defaultMessage: "Could not save content sync",
    id: "jvxijlYLgS",
    description: "Toast after create failure",
  },
  runSuccess: {
    defaultMessage: "Sync queued",
    id: "SLGNO7qFzS",
    description: "Toast after Sync now",
  },
  runError: {
    defaultMessage: "Could not start sync",
    id: "pLLlDE7N69",
    description: "Toast after Sync now failure",
  },
  github: {
    defaultMessage: "GitHub",
    id: "QpmZurrWHD",
    description: "GitHub provider label",
  },
  gitlab: {
    defaultMessage: "GitLab",
    id: "K4+ynunWBF",
    description: "GitLab provider label",
  },
  contentful: {
    defaultMessage: "Contentful",
    id: "sVrz//onkQ",
    description: "Contentful provider label",
  },
  intercom: {
    defaultMessage: "Intercom",
    id: "xBKYTJYExq",
    description: "Intercom provider label",
  },
});
