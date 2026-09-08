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
import { eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";

import { resolveApiKeyTeamAccessContext } from "@/api/auth/api-key-access";
import { authenticatePresentedApiKey, type ApiKeyAuthVariables } from "@/api/auth/api-key";
import type { McpAuthVariables } from "@/api/auth/mcp";
import { forbiddenResponse } from "@/api/response.schema";
import { db, schema } from "@/lib/database/client";
import { isErr } from "@/lib/primitives/result/results";
import {
  isCompactJwt,
  MCP_AGENT_SCOPE,
  publicApiWwwAuthenticate,
  verifyWorkosAgentAccessToken,
  type AgentAccessTokenClaims,
} from "@/lib/workos/agent-access-token";

export function agentAuthLogContext(input: {
  registrationId: string;
  localUserId: string;
  localOrganizationId: string;
}) {
  return {
    auth: {
      agentRegistrationId: input.registrationId,
      localOrganizationId: input.localOrganizationId,
      localUserId: input.localUserId,
    },
  };
}

export async function resolveAgentAccessContext(claims: AgentAccessTokenClaims) {
  const [user] = await db
    .select({
      id: schema.users.id,
      workosUserId: schema.users.workosUserId,
      email: schema.users.email,
    })
    .from(schema.users)
    .where(eq(schema.users.workosUserId, claims.workosUserId))
    .limit(1);

  const [organization] = await db
    .select({
      id: schema.organizations.id,
      workosOrganizationId: schema.organizations.workosOrganizationId,
      name: schema.organizations.name,
      slug: schema.organizations.slug,
      lifecycleStatus: schema.organizations.lifecycleStatus,
    })
    .from(schema.organizations)
    .where(eq(schema.organizations.workosOrganizationId, claims.workosOrganizationId))
    .limit(1);

  if (!user || !organization) {
    return { status: "unauthorized" as const };
  }

  if (organization.lifecycleStatus !== "active") {
    return { status: "workspace_archived" as const };
  }

  const teamAccess = await resolveApiKeyTeamAccessContext({
    organizationId: organization.id,
    createdByUserId: user.id,
  });

  if (!teamAccess) {
    return { status: "unauthorized" as const };
  }

  return {
    status: "authorized" as const,
    claims,
    user,
    organization,
    teamAccess,
  };
}

export const publicApiAuthMiddleware = createMiddleware<{ Variables: ApiKeyAuthVariables }>(
  async (c, next) => {
    const apiKey = c.req.header("x-api-key");
    if (apiKey) {
      return authenticatePresentedApiKey(c, next, apiKey);
    }

    const authorization = c.req.header("authorization");
    const token = authorization?.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length)
      : null;

    if (!token || !isCompactJwt(token)) {
      return c.json({ error: "unauthorized", message: "Authentication required" }, 401, {
        "WWW-Authenticate": publicApiWwwAuthenticate(c.req.url),
      });
    }

    const verified = await verifyWorkosAgentAccessToken(token);
    if (isErr(verified)) {
      return c.json({ error: "unauthorized", message: "Authentication required" }, 401, {
        "WWW-Authenticate": publicApiWwwAuthenticate(c.req.url),
      });
    }

    const resolved = await resolveAgentAccessContext(verified.value);
    if (resolved.status === "workspace_archived") {
      return forbiddenResponse(c, "workspace_archived", "This workspace has been archived");
    }

    if (resolved.status !== "authorized") {
      return forbiddenResponse(c, "forbidden", "Agent is not authorized for this workspace");
    }

    c.set("auth", {
      organization: {
        localOrganizationId: resolved.organization.id,
      },
      apiKey: {
        id: resolved.claims.registrationId,
        permissions: resolved.claims.scopes,
        kind: "agent",
      },
      teamAccess: resolved.teamAccess,
    });
    c.get("log").set(
      agentAuthLogContext({
        registrationId: resolved.claims.registrationId,
        localUserId: resolved.user.id,
        localOrganizationId: resolved.organization.id,
      }),
    );

    await next();
  },
);

export async function authenticateMcpAgentBearer(
  token: string,
): Promise<
  | { status: "authorized"; auth: McpAuthVariables["mcpAuth"] }
  | { status: "unauthorized" }
  | { status: "workspace_archived" }
  | { status: "forbidden" }
> {
  if (!isCompactJwt(token)) {
    return { status: "unauthorized" };
  }

  const verified = await verifyWorkosAgentAccessToken(token);
  if (isErr(verified)) {
    return { status: "unauthorized" };
  }

  if (!verified.value.scopes.includes(MCP_AGENT_SCOPE)) {
    return { status: "forbidden" };
  }

  const resolved = await resolveAgentAccessContext(verified.value);
  if (resolved.status !== "authorized") {
    return resolved;
  }

  return {
    status: "authorized",
    auth: {
      user: {
        localUserId: resolved.user.id,
        workosUserId: resolved.user.workosUserId,
        email: resolved.user.email,
      },
      organization: {
        localOrganizationId: resolved.organization.id,
        workosOrganizationId: resolved.organization.workosOrganizationId,
        name: resolved.organization.name,
        slug: resolved.organization.slug,
      },
      membership: {
        workosMembershipId: resolved.teamAccess.membership.workosMembershipId ?? null,
        role: resolved.teamAccess.membership.role,
      },
      session: {
        id: resolved.claims.registrationId,
      },
    },
  };
}
