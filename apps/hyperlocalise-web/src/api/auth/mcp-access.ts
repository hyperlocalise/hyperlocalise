import type { McpAuthVariables } from "@/api/auth/mcp";
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

  return {
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
    capabilities: [],
  };
}
