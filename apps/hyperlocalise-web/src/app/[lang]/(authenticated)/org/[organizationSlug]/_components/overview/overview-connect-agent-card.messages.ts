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

export const overviewConnectAgentCardMessages = defineMessages({
  title: {
    defaultMessage: "Connect your agent",
    id: "OY5+Uf7y9y",
    description: "Overview card title for connecting an MCP client to the workspace",
  },
  compactTitle: {
    defaultMessage: "Connect agent",
    id: "dp8lrm07um",
    description: "Compact overview card title beside the Slack channel request card",
  },
  description: {
    defaultMessage: "Access your Hyperlocalise workspace from MCP clients.",
    id: "I3Xom21N//",
    description: "Overview card description for the inbound MCP connection snippet",
  },
  setupGuide: {
    defaultMessage: "Setup guide",
    id: "FJwHsDxO6W",
    description: "Link to the selected MCP client's setup documentation",
  },
  clientClaude: {
    defaultMessage: "Claude",
    id: "PHuY/CmjvV",
    description: "MCP client tab label for Claude",
  },
  clientCodex: {
    defaultMessage: "Codex",
    id: "G9IH7mtmIb",
    description: "MCP client tab label for Codex",
  },
  clientCursor: {
    defaultMessage: "Cursor",
    id: "kDHggb67Dc",
    description: "MCP client tab label for Cursor",
  },
  snippetLabel: {
    defaultMessage: "Install command for {client}",
    id: "pmeyEQny7X",
    description: "Accessible label for the copyable MCP install snippet",
  },
  claudeNextStep: {
    defaultMessage: "Then run {command} to authenticate.",
    id: "JvZ26UFlte",
    description: "Next step after adding the Hyperlocalise MCP server in Claude",
  },
  codexNextStep: {
    defaultMessage: "Then run {command} to authenticate.",
    id: "G8NgjmMOFE",
    description: "Next step after adding the Hyperlocalise MCP server in Codex",
  },
  cursorNextStep: {
    defaultMessage: "Add this to ~/.cursor/mcp.json, then open Settings → MCP and click Login.",
    id: "V9ow5L2f7M",
    description: "Next step after copying the Hyperlocalise MCP config for Cursor",
  },
});
