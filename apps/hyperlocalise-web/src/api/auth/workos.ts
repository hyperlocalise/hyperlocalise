import { createMiddleware } from "hono/factory";
import type { EvlogVariables } from "evlog/hono";

import { forbiddenResponse, unauthorizedResponse } from "@/api/errors";
import { type OrganizationCapability } from "@/api/auth/policy";
import type { OrganizationMembershipRole, TeamMembershipRole } from "@/lib/database/types";
import { resolveApiAuthContextFromSession } from "@/api/auth/workos-session";

export type WorkosUserIdentity = {
  workosUserId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
};

export type WorkosOrganizationIdentity = {
  workosOrganizationId: string;
  name: string;
  slug?: string;
};

export type WorkosMembershipIdentity = {
  workosMembershipId?: string;
  role: OrganizationMembershipRole;
};

export type WorkosAuthIdentity = {
  user: WorkosUserIdentity;
  organization: WorkosOrganizationIdentity;
  membership: WorkosMembershipIdentity;
};

export type ApiAuthContext = {
  user: {
    workosUserId: string;
    localUserId: string;
    email: string;
  };
  organizations: Array<{
    workosOrganizationId: string;
    localOrganizationId: string;
    name: string;
    slug?: string | null;
    membership: {
      workosMembershipId?: string | null;
      role: OrganizationMembershipRole;
    };
  }>;
  organization: {
    workosOrganizationId: string;
    localOrganizationId: string;
    name: string;
    slug?: string | null;
    membership: {
      workosMembershipId?: string | null;
      role: OrganizationMembershipRole;
    };
  };
  activeOrganization: {
    workosOrganizationId: string;
    localOrganizationId: string;
    name: string;
    slug?: string | null;
    membership: {
      workosMembershipId?: string | null;
      role: OrganizationMembershipRole;
    };
  };
  membership: {
    workosMembershipId?: string | null;
    role: OrganizationMembershipRole;
  };
  activeTeam: {
    id: string;
    slug: string;
    name: string;
    role: TeamMembershipRole;
  } | null;
  capabilities: OrganizationCapability[];
};

export { enrichAuthContextWithCapabilities } from "@/api/auth/policy";

export type AuthVariables = EvlogVariables["Variables"] & {
  auth: ApiAuthContext;
};

export function createWorkosAuthMiddleware() {
  return createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
    try {
      if (!c.req.raw.headers.has("cookie")) {
        throw new Error("missing_auth_context");
      }

      const requestUrl = new URL(c.req.url);
      const organizationSlug =
        c.req.param("organizationSlug") ||
        c.req.header("x-hyperlocalise-organization-slug") ||
        requestUrl.searchParams.get("organizationSlug") ||
        undefined;
      const teamSlug =
        c.req.header("x-hyperlocalise-team-slug") ||
        requestUrl.searchParams.get("teamSlug") ||
        undefined;

      c.get("log").set({
        auth: { organizationSlug, teamSlug },
      });

      const authFromSession = await resolveApiAuthContextFromSession({
        cookie: c.req.header("cookie"),
        organizationSlug,
        teamSlug,
      });
      if (!authFromSession) {
        throw new Error("missing_auth_context");
      }

      c.set("auth", authFromSession);
      c.get("log").set({
        auth: {
          organizationSlug,
          teamSlug,
          localUserId: authFromSession.user.localUserId,
          localOrganizationId: authFromSession.organization.localOrganizationId,
          activeTeamId: authFromSession.activeTeam?.id,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "unauthorized";

      if (message === "missing_auth_context") {
        return unauthorizedResponse(c, "unauthorized", "Authentication required");
      }

      if (message === "organization_access_denied") {
        return forbiddenResponse(c, "organization_access_denied", "Organization access denied");
      }

      // Re-throw genuinely unexpected errors so the centralized onError
      // handler can log them and return a safe generic response.
      throw error;
    }

    await next();
  });
}

export const workosAuthMiddleware = createWorkosAuthMiddleware();
