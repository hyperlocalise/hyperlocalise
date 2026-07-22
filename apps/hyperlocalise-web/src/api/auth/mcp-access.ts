/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import type { McpAuthVariables } from "@/api/auth/mcp";
import { enrichAuthContextWithCapabilities } from "@/api/auth/policy";
import type { ApiAuthContext } from "@/api/auth/workos";
import { resolveOrganizationMembershipAccessSource } from "@/lib/workos/membership-access";

/** Maps MCP bearer auth to the same ApiAuthContext shape REST routes use for team scoping. */
export function apiAuthContextFromMcpAuth(mcpAuth: McpAuthVariables["mcpAuth"]): ApiAuthContext {
  const organization = {
    workosOrganizationId: mcpAuth.organization.workosOrganizationId,
    localOrganizationId: mcpAuth.organization.localOrganizationId,
    name: mcpAuth.organization.name,
    slug: mcpAuth.organization.slug,
    membership: {
      workosMembershipId: mcpAuth.membership.workosMembershipId,
      role: mcpAuth.membership.role,
      accessSource: resolveOrganizationMembershipAccessSource(
        mcpAuth.membership.workosMembershipId,
      ),
    },
  };

  return enrichAuthContextWithCapabilities({
    user: {
      workosUserId: mcpAuth.user.workosUserId,
      localUserId: mcpAuth.user.localUserId,
      email: mcpAuth.user.email,
    },
    organizations: [],
    organization,
    activeOrganization: organization,
    membership: organization.membership,
    activeTeam: null,
  });
}
