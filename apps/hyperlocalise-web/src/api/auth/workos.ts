import { createMiddleware } from "hono/factory";
import type { EvlogVariables } from "evlog/hono";

import { apiErrorResponse, forbiddenResponse, unauthorizedResponse } from "@/api/errors";
import { type OrganizationCapability } from "@/api/auth/policy";
import type { OrganizationMembershipRole, TeamMembershipRole } from "@/lib/database/types";
import type { OrganizationMembershipAccessSource } from "@/lib/workos/membership-access";
import {
  resolveApiAuthContextFromSession,
  OrganizationSlugUnresolvableError,
  StaleOrganizationSlugError,
} from "@/api/auth/workos-session";

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
      accessSource: OrganizationMembershipAccessSource;
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
      accessSource: OrganizationMembershipAccessSource;
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
      accessSource: OrganizationMembershipAccessSource;
    };
  };
  membership: {
    workosMembershipId?: string | null;
    role: OrganizationMembershipRole;
    accessSource: OrganizationMembershipAccessSource;
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
        if (organizationSlug) {
          throw new Error("organization_access_denied");
        }

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
      if (error instanceof StaleOrganizationSlugError) {
        return apiErrorResponse(c, 403, "stale_organization_slug", "Organization slug changed", {
          requestedSlug: error.requestedSlug,
          currentSlug: error.currentSlug,
          redirectTo: `/org/${error.currentSlug}/dashboard`,
        });
      }

      if (error instanceof OrganizationSlugUnresolvableError) {
        return forbiddenResponse(
          c,
          "organization_slug_unresolvable",
          "Organization slug is unavailable; choose another workspace",
        );
      }

      const message = error instanceof Error ? error.message : "unauthorized";

      if (message === "missing_auth_context") {
        return unauthorizedResponse(c, "unauthorized", "Authentication required");
      }

      if (message === "archived_organization_access") {
        return forbiddenResponse(c, "workspace_archived", "This workspace has been archived");
      }

      if (message === "organization_access_denied") {
        return forbiddenResponse(c, "organization_access_denied", "Organization access denied");
      }

      if (message === "workos_membership_lookup_failed") {
        return forbiddenResponse(
          c,
          "workos_membership_lookup_failed",
          "Organization membership could not be verified",
        );
      }

      // Re-throw genuinely unexpected errors so the centralized onError
      // handler can log them and return a safe generic response.
      throw error;
    }

    await next();
  });
}

export const workosAuthMiddleware = createWorkosAuthMiddleware();
