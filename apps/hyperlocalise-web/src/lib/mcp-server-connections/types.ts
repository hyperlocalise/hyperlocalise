export type McpServerTransport = "http" | "sse";
export type McpServerAuthKind = "none" | "bearer" | "headers";

export type McpServerAuthSecret = {
  bearerToken?: string;
  headers?: Record<string, string>;
};

export type McpServerConnectionSummary = {
  id: string;
  organizationId: string;
  displayName: string;
  serverUrl: string;
  transport: McpServerTransport;
  authKind: McpServerAuthKind;
  enabled: boolean;
  validationStatus: string;
  validationMessage: string | null;
  lastValidatedAt: string | null;
  maskedTokenSuffix: string;
  createdAt: string;
  updatedAt: string;
};

export type McpServerConnectionWithSecret = {
  connection: McpServerConnectionSummary;
  secret: McpServerAuthSecret;
};

export type McpServerConnectionError =
  | { code: "mcp_server_url_invalid"; message: string }
  | { code: "mcp_server_auth_required"; message: string }
  | { code: "mcp_server_connection_not_found"; message: string }
  | { code: "mcp_server_connection_decrypt_failed"; message: string }
  | { code: "mcp_server_connection_duplicate_url"; message: string };
