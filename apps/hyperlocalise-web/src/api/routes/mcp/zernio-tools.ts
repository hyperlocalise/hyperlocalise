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
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { ApiAuthContext } from "@/api/auth/workos";
import { err, isErr, type Result } from "@/lib/primitives/result/results";
import {
  createZernioAd,
  createZernioCampaign,
  getZernioAd,
  listZernioAccounts,
  listZernioAds,
} from "@/lib/zernio/client";
import {
  zernioCreateAdInputSchema,
  zernioCreateCampaignInputSchema,
} from "@/lib/zernio/agent-tools";
import { listZernioConnections, resolveZernioConnectionWithApiKey } from "@/lib/zernio/connections";
import type { ZernioConnectionError, ZernioConnectionWithApiKey } from "@/lib/zernio/types";

function mcpToolError(code: string, message: string, details?: Record<string, unknown>) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ error: code, message, ...details }),
      },
    ],
    isError: true,
  };
}

function mcpToolJson(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
  };
}

const connectionIdSchema = z.string().uuid().optional();

async function resolveApiKey(input: {
  apiAuth: ApiAuthContext;
  connectionId?: string;
}): Promise<Result<ZernioConnectionWithApiKey, ZernioConnectionError>> {
  const resolved = await resolveZernioConnectionWithApiKey({
    organizationId: input.apiAuth.organization.localOrganizationId,
    connectionId: input.connectionId,
  });
  if (isErr(resolved)) {
    return resolved;
  }
  if (
    !resolved.value.connection.enabled ||
    resolved.value.connection.validationStatus !== "valid"
  ) {
    return err({
      code: "zernio_not_connected",
      message: "Enable the selected Zernio connection in Integrations before using it.",
    });
  }
  return resolved;
}

export function registerZernioMcpTools(server: McpServer, apiAuth: ApiAuthContext) {
  server.registerTool(
    "zernio_list_connections",
    {
      description:
        "List Zernio API key connections for this organization. Secrets are never returned. Use a connection id with the other zernio_* tools when more than one connection exists.",
      inputSchema: z.object({}),
    },
    async () => {
      const zernioConnections = await listZernioConnections({
        organizationId: apiAuth.organization.localOrganizationId,
      });
      return mcpToolJson({
        zernioConnections: zernioConnections.map((connection) => ({
          id: connection.id,
          displayName: connection.displayName,
          enabled: connection.enabled,
          validationStatus: connection.validationStatus,
          maskedApiKeySuffix: connection.maskedApiKeySuffix,
        })),
      });
    },
  );

  server.registerTool(
    "zernio_list_accounts",
    {
      description:
        "List Zernio social and ads accounts for a connected API key. Use account _id as accountId when creating ads.",
      inputSchema: z.object({
        connectionId: connectionIdSchema,
      }),
    },
    async ({ connectionId }) => {
      const resolved = await resolveApiKey({ apiAuth, connectionId });
      if (isErr(resolved)) {
        return mcpToolError(resolved.error.code, resolved.error.message);
      }
      const result = await listZernioAccounts({ apiKey: resolved.value.apiKey });
      if (isErr(result)) {
        return mcpToolError(result.error.code, result.error.message);
      }
      return mcpToolJson(result.value);
    },
  );

  server.registerTool(
    "zernio_list_ads",
    {
      description: "Read the Zernio ads tree (campaign → ad set → ad) with rolled-up metrics.",
      inputSchema: z.object({
        connectionId: connectionIdSchema,
        accountId: z.string().trim().min(1).max(128).optional(),
      }),
    },
    async ({ connectionId, accountId }) => {
      const resolved = await resolveApiKey({ apiAuth, connectionId });
      if (isErr(resolved)) {
        return mcpToolError(resolved.error.code, resolved.error.message);
      }
      const result = await listZernioAds({ apiKey: resolved.value.apiKey, accountId });
      if (isErr(result)) {
        return mcpToolError(result.error.code, result.error.message);
      }
      return mcpToolJson(result.value);
    },
  );

  server.registerTool(
    "zernio_get_ad",
    {
      description: "Get one Zernio ad by id, including creative, targeting, and metrics.",
      inputSchema: z.object({
        connectionId: connectionIdSchema,
        adId: z.string().trim().min(1).max(128),
      }),
    },
    async ({ connectionId, adId }) => {
      const resolved = await resolveApiKey({ apiAuth, connectionId });
      if (isErr(resolved)) {
        return mcpToolError(resolved.error.code, resolved.error.message);
      }
      const result = await getZernioAd({ apiKey: resolved.value.apiKey, adId });
      if (isErr(result)) {
        return mcpToolError(result.error.code, result.error.message);
      }
      return mcpToolJson(result.value);
    },
  );

  server.registerTool(
    "zernio_create_ad",
    {
      description:
        "Create a paid ad through Zernio (POST /v1/ads/create) on Meta, Google, TikTok, LinkedIn, Pinterest, X, or OpenAI Ads. Creates campaign, ad set, and ad unless existingCampaignId or adSetId is set.",
      inputSchema: zernioCreateAdInputSchema.extend({
        connectionId: connectionIdSchema,
      }),
    },
    async (input) => {
      const { connectionId, extra, idempotencyKey, ...fields } = input;
      const resolved = await resolveApiKey({ apiAuth, connectionId });
      if (isErr(resolved)) {
        return mcpToolError(resolved.error.code, resolved.error.message);
      }
      const result = await createZernioAd({
        apiKey: resolved.value.apiKey,
        idempotencyKey,
        body: {
          ...extra,
          ...Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)),
        },
      });
      if (isErr(result)) {
        return mcpToolError(result.error.code, result.error.message);
      }
      return mcpToolJson(result.value);
    },
  );

  server.registerTool(
    "zernio_create_campaign",
    {
      description:
        "Create a standalone Zernio campaign without its first ad set. Ad sets join later via existingCampaignId on zernio_create_ad.",
      inputSchema: zernioCreateCampaignInputSchema.extend({
        connectionId: connectionIdSchema,
      }),
    },
    async (input) => {
      const { connectionId, extra, idempotencyKey, ...fields } = input;
      const resolved = await resolveApiKey({ apiAuth, connectionId });
      if (isErr(resolved)) {
        return mcpToolError(resolved.error.code, resolved.error.message);
      }
      const result = await createZernioCampaign({
        apiKey: resolved.value.apiKey,
        idempotencyKey,
        body: {
          ...extra,
          ...Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)),
        },
      });
      if (isErr(result)) {
        return mcpToolError(result.error.code, result.error.message);
      }
      return mcpToolJson(result.value);
    },
  );
}
