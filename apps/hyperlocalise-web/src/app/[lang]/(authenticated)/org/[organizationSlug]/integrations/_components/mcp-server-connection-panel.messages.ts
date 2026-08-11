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

export const mcpServerConnectionPanelMessages = defineMessages({
  categoryLabel: {
    defaultMessage: "MCP servers",
    id: "VucfHYKoo9",
    description: "Category label for MCP server connections on Integrations",
  },
  rowName: {
    defaultMessage: "MCP Server",
    id: "pWz7w78j0z",
    description: "Name shown for the MCP server integrations row",
  },
  rowDescription: {
    defaultMessage: "Connect remote MCP servers for automation tools.",
    id: "LgRbsjVF3G",
    description: "Description for the MCP server integrations row",
  },
  addServer: {
    defaultMessage: "Add server",
    id: "2OwyLgvXmq",
    description: "Button to add a new MCP server connection",
  },
  displayNameLabel: {
    defaultMessage: "Display name",
    id: "TRXXor6TdH",
    description: "Label for MCP server display name field",
  },
  serverUrlLabel: {
    defaultMessage: "Server URL",
    id: "0a0+8rBPeu",
    description: "Label for MCP server URL field",
  },
  transportLabel: {
    defaultMessage: "Transport",
    id: "WUqvqtUFLC",
    description: "Label for MCP transport select",
  },
  authKindLabel: {
    defaultMessage: "Authentication",
    id: "Pe5Th0pOzu",
    description: "Label for MCP auth kind select",
  },
  bearerTokenLabel: {
    defaultMessage: "Bearer token",
    id: "8YwlZNuV6a",
    description: "Label for MCP bearer token field",
  },
  headersLabel: {
    defaultMessage: "Headers (JSON object)",
    id: "2+doJ4Hdy3",
    description: "Label for MCP custom headers JSON field",
  },
  headersPlaceholder: {
    defaultMessage: "Paste a JSON object of header names to values",
    id: "C3tn66TqXh",
    description: "Placeholder for MCP custom headers JSON field",
  },
  save: {
    defaultMessage: "Save",
    id: "l1pfctOYid",
    description: "Save MCP server connection button",
  },
  cancel: {
    defaultMessage: "Cancel",
    id: "3jvYXfkLHR",
    description: "Cancel adding MCP server connection",
  },
  delete: {
    defaultMessage: "Delete",
    id: "T+lSNezp+m",
    description: "Delete MCP server connection button",
  },
  fetchFailed: {
    defaultMessage: "Failed to load MCP server connections.",
    id: "8BNWbIB542",
    description: "Error when MCP server connections cannot be loaded",
  },
  saveFailed: {
    defaultMessage: "Failed to save MCP server connection.",
    id: "iMi751w5KI",
    description: "Error when MCP server connection save fails",
  },
  saveSucceeded: {
    defaultMessage: "MCP server connection saved.",
    id: "AK+FWYZO89",
    description: "Toast when MCP server connection is saved",
  },
  deleteFailed: {
    defaultMessage: "Failed to delete MCP server connection.",
    id: "CvJnbfBP5e",
    description: "Error when MCP server connection delete fails",
  },
  deleteSucceeded: {
    defaultMessage: "MCP server connection deleted.",
    id: "StgM1dze9o",
    description: "Toast when MCP server connection is deleted",
  },
  invalidHeaders: {
    defaultMessage: "Headers must be a JSON object of string values.",
    id: "zjsy1cdZoN",
    description: "Validation error for MCP headers JSON",
  },
  authNone: {
    defaultMessage: "None",
    id: "a6VlArjU8i",
    description: "MCP auth kind option: none",
  },
  authBearer: {
    defaultMessage: "Bearer token",
    id: "SINqXFqnkL",
    description: "MCP auth kind option: bearer",
  },
  authHeaders: {
    defaultMessage: "Custom headers",
    id: "ekU8Q0suHQ",
    description: "MCP auth kind option: headers",
  },
  transportHttp: {
    defaultMessage: "HTTP",
    id: "KXnH/FP4XN",
    description: "MCP transport option: streamable HTTP",
  },
  transportSse: {
    defaultMessage: "SSE",
    id: "vSUdGKQLPt",
    description: "MCP transport option: SSE",
  },
  emptyState: {
    defaultMessage: "No MCP servers connected yet.",
    id: "IWQH2bHvzr",
    description: "Empty state when no MCP server connections exist",
  },
  tokenConfigured: {
    defaultMessage: "Secret ending in {suffix}",
    id: "yV9kjoqQN1",
    description: "Hint that an MCP auth secret is already stored",
  },
});
