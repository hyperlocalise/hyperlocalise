import { Hono } from "hono";
import { validator } from "hono/validator";

import { hasCapability } from "@/api/auth/policy";
import { workosAuthMiddleware, type AuthVariables } from "@/api/auth/workos";
import {
  badRequestResponse,
  conflictResponse,
  forbiddenResponse,
  notFoundResponse,
} from "@/api/response.schema";
import {
  createMcpServerConnection,
  deleteMcpServerConnection,
  getMcpServerConnection,
  listMcpServerConnections,
  updateMcpServerConnection,
} from "@/lib/mcp-server-connections/connections";
import type { McpServerConnectionError } from "@/lib/mcp-server-connections/types";
import { isErr } from "@/lib/primitives/result/results";

import {
  createMcpServerConnectionBodySchema,
  mcpServerConnectionIdParamSchema,
  updateMcpServerConnectionBodySchema,
} from "./mcp-server-connection.schema";

const validateConnectionParams = validator("param", (value, c) => {
  const parsed = mcpServerConnectionIdParamSchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(c, "invalid_mcp_server_connection_id");
  }
  return parsed.data;
});

const validateCreateBody = validator("json", (value, c) => {
  const parsed = createMcpServerConnectionBodySchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(
      c,
      "invalid_mcp_server_connection_payload",
      "MCP server connection payload is invalid.",
      parsed.error.flatten(),
    );
  }
  return parsed.data;
});

const validateUpdateBody = validator("json", (value, c) => {
  const parsed = updateMcpServerConnectionBodySchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(
      c,
      "invalid_mcp_server_connection_payload",
      "MCP server connection payload is invalid.",
      parsed.error.flatten(),
    );
  }
  return parsed.data;
});

function canReadMcpServers(role: AuthVariables["auth"]["membership"]["role"]) {
  return hasCapability(role, "integrations:read");
}

function canWriteMcpServers(role: AuthVariables["auth"]["membership"]["role"]) {
  return hasCapability(role, "provider_credentials:write");
}

function mapMcpServerConnectionError(
  c: Parameters<typeof badRequestResponse>[0],
  error: McpServerConnectionError,
) {
  switch (error.code) {
    case "mcp_server_connection_not_found":
      return notFoundResponse(c, error.code, error.message);
    case "mcp_server_connection_duplicate_url":
      return conflictResponse(c, error.code, error.message);
    default:
      return badRequestResponse(c, error.code, error.message);
  }
}

export function createMcpServerConnectionRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .get("/", async (c) => {
      if (!canReadMcpServers(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const mcpServerConnections = await listMcpServerConnections({
        organizationId: c.var.auth.organization.localOrganizationId,
      });

      return c.json({ mcpServerConnections }, 200);
    })
    .post("/", validateCreateBody, async (c) => {
      if (!canWriteMcpServers(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const body = c.req.valid("json");
      const result = await createMcpServerConnection({
        organizationId: c.var.auth.organization.localOrganizationId,
        userId: c.var.auth.user.localUserId,
        displayName: body.displayName,
        serverUrl: body.serverUrl,
        transport: body.transport,
        authKind: body.authKind,
        bearerToken: body.bearerToken,
        headers: body.headers,
        enabled: body.enabled,
      });

      if (isErr(result)) {
        return mapMcpServerConnectionError(c, result.error);
      }

      return c.json({ mcpServerConnection: result.value }, 201);
    })
    .get("/:connectionId", validateConnectionParams, async (c) => {
      if (!canReadMcpServers(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const { connectionId } = c.req.valid("param");
      const mcpServerConnection = await getMcpServerConnection({
        organizationId: c.var.auth.organization.localOrganizationId,
        connectionId,
      });

      if (!mcpServerConnection) {
        return notFoundResponse(c, "mcp_server_connection_not_found");
      }

      return c.json({ mcpServerConnection }, 200);
    })
    .patch("/:connectionId", validateConnectionParams, validateUpdateBody, async (c) => {
      if (!canWriteMcpServers(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const { connectionId } = c.req.valid("param");
      const body = c.req.valid("json");
      const result = await updateMcpServerConnection({
        organizationId: c.var.auth.organization.localOrganizationId,
        userId: c.var.auth.user.localUserId,
        connectionId,
        displayName: body.displayName,
        serverUrl: body.serverUrl,
        transport: body.transport,
        authKind: body.authKind,
        bearerToken: body.bearerToken,
        headers: body.headers,
        enabled: body.enabled,
      });

      if (isErr(result)) {
        return mapMcpServerConnectionError(c, result.error);
      }

      if (!result.value) {
        return notFoundResponse(c, "mcp_server_connection_not_found");
      }

      return c.json({ mcpServerConnection: result.value }, 200);
    })
    .delete("/:connectionId", validateConnectionParams, async (c) => {
      if (!canWriteMcpServers(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const { connectionId } = c.req.valid("param");
      const deleted = await deleteMcpServerConnection({
        organizationId: c.var.auth.organization.localOrganizationId,
        connectionId,
      });

      if (!deleted) {
        return notFoundResponse(c, "mcp_server_connection_not_found");
      }

      return c.body(null, 204);
    });
}
