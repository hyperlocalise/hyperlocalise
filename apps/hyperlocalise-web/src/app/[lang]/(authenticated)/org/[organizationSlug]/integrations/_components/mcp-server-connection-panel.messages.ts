"use client";

import { defineMessages } from "react-intl";

export const mcpServerConnectionPanelMessages = defineMessages({
  categoryLabel: {
    defaultMessage: "MCP servers",
    id: "mcpCatLbl1",
    description: "Category label for MCP server connections on Integrations",
  },
  rowName: {
    defaultMessage: "MCP Server",
    id: "mcpRowName1",
    description: "Name shown for the MCP server integrations row",
  },
  rowDescription: {
    defaultMessage: "Connect remote MCP servers for automation tools.",
    id: "mcpRowDesc1",
    description: "Description for the MCP server integrations row",
  },
  addServer: {
    defaultMessage: "Add server",
    id: "mcpAddSrv1",
    description: "Button to add a new MCP server connection",
  },
  displayNameLabel: {
    defaultMessage: "Display name",
    id: "mcpDispNm1",
    description: "Label for MCP server display name field",
  },
  serverUrlLabel: {
    defaultMessage: "Server URL",
    id: "mcpSrvUrl1",
    description: "Label for MCP server URL field",
  },
  transportLabel: {
    defaultMessage: "Transport",
    id: "mcpTransp1",
    description: "Label for MCP transport select",
  },
  authKindLabel: {
    defaultMessage: "Authentication",
    id: "mcpAuthKd1",
    description: "Label for MCP auth kind select",
  },
  bearerTokenLabel: {
    defaultMessage: "Bearer token",
    id: "mcpBearTok",
    description: "Label for MCP bearer token field",
  },
  headersLabel: {
    defaultMessage: "Headers (JSON object)",
    id: "mcpHdrsLb1",
    description: "Label for MCP custom headers JSON field",
  },
  headersPlaceholder: {
    defaultMessage: '{"X-Api-Key":"..."}',
    id: "mcpHdrsPh1",
    description: "Placeholder for MCP custom headers JSON field",
  },
  save: {
    defaultMessage: "Save",
    id: "mcpSaveBtn",
    description: "Save MCP server connection button",
  },
  cancel: {
    defaultMessage: "Cancel",
    id: "mcpCancel1",
    description: "Cancel adding MCP server connection",
  },
  delete: {
    defaultMessage: "Delete",
    id: "mcpDelete1",
    description: "Delete MCP server connection button",
  },
  fetchFailed: {
    defaultMessage: "Failed to load MCP server connections.",
    id: "mcpFetchFl",
    description: "Error when MCP server connections cannot be loaded",
  },
  saveFailed: {
    defaultMessage: "Failed to save MCP server connection.",
    id: "mcpSaveFl1",
    description: "Error when MCP server connection save fails",
  },
  saveSucceeded: {
    defaultMessage: "MCP server connection saved.",
    id: "mcpSaveOk1",
    description: "Toast when MCP server connection is saved",
  },
  deleteFailed: {
    defaultMessage: "Failed to delete MCP server connection.",
    id: "mcpDelFl1",
    description: "Error when MCP server connection delete fails",
  },
  deleteSucceeded: {
    defaultMessage: "MCP server connection deleted.",
    id: "mcpDelOk1",
    description: "Toast when MCP server connection is deleted",
  },
  invalidHeaders: {
    defaultMessage: "Headers must be a JSON object of string values.",
    id: "mcpBadHdrs",
    description: "Validation error for MCP headers JSON",
  },
  authNone: {
    defaultMessage: "None",
    id: "mcpAuthNon",
    description: "MCP auth kind option: none",
  },
  authBearer: {
    defaultMessage: "Bearer token",
    id: "mcpAuthBer",
    description: "MCP auth kind option: bearer",
  },
  authHeaders: {
    defaultMessage: "Custom headers",
    id: "mcpAuthHdr",
    description: "MCP auth kind option: headers",
  },
  transportHttp: {
    defaultMessage: "HTTP",
    id: "mcpTrHttp1",
    description: "MCP transport option: streamable HTTP",
  },
  transportSse: {
    defaultMessage: "SSE",
    id: "mcpTrSse01",
    description: "MCP transport option: SSE",
  },
  emptyState: {
    defaultMessage: "No MCP servers connected yet.",
    id: "mcpEmpty01",
    description: "Empty state when no MCP server connections exist",
  },
  tokenConfigured: {
    defaultMessage: "Secret ending in {suffix}",
    id: "mcpTokCfg1",
    description: "Hint that an MCP auth secret is already stored",
  },
});
