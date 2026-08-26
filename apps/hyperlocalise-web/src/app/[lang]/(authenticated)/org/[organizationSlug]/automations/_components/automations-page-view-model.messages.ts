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

export const automationsPageViewModelMessages = defineMessages({
  triggerScheduled: {
    defaultMessage: "Scheduled",
    id: "MXyOWGXSz8",
    description: "Trigger label for a scheduled automation in the list",
  },
  triggerGithub: {
    defaultMessage: "GitHub push",
    id: "uycq9iF49K",
    description: "Trigger label for a GitHub push automation in the list",
  },
  triggerManual: {
    defaultMessage: "Manual",
    id: "sbr8qd8WgZ",
    description: "Trigger label for a manual automation in the list",
  },
  triggerContentful: {
    defaultMessage: "Contentful webhook",
    id: "FBmmj9seNr",
    description: "Trigger label for a Contentful webhook automation in the list",
  },
  triggerSourceUpload: {
    defaultMessage: "Source upload",
    id: "N0aSJ10JRf",
    description: "Trigger label for a source upload automation in the list",
  },
  triggerWebChat: {
    defaultMessage: "Web chat",
    id: "J210+x7u6p",
    description: "Trigger label for a web chat automation in the list",
  },
  toolKnowledgeFiles: {
    defaultMessage: "Knowledge files",
    id: "l0dInWPeYD",
    description: "Tool badge when an automation uses uploaded knowledge files",
  },
  toolGithub: {
    defaultMessage: "GitHub",
    id: "LKQXtMkDON",
    description: "Tool badge when an automation uses GitHub",
  },
  toolSlack: {
    defaultMessage: "Slack",
    id: "y5oeiThV/6",
    description: "Tool badge when an automation uses Slack",
  },
  toolEmail: {
    defaultMessage: "Email",
    id: "6QqDATp4yt",
    description: "Tool badge when an automation uses email",
  },
  toolGithubComment: {
    defaultMessage: "PR comment",
    id: "CvmC1QddwG",
    description: "Tool badge when an automation posts GitHub pull request comments",
  },
  toolMcpServer: {
    defaultMessage: "MCP Server",
    id: "RLPdxshxAq",
    description: "Tool badge when an automation uses an MCP server",
  },
  unknownCreator: {
    defaultMessage: "Unknown",
    id: "O+ldw8Aj3z",
    description: "Fallback label when an automation has no creator name",
  },
});
