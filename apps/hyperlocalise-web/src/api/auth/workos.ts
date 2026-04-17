import { createMiddleware } from "hono/factory";

import type { OrganizationMembershipRole } from "@/lib/database/types";

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
  organization: {
    workosOrganizationId: string;
    localOrganizationId: string;
    name: string;
    slug?: string | null;
  };
  membership: {
    workosMembershipId?: string | null;
    role: OrganizationMembershipRole;
  };
};

export interface AuthVariables {
  auth: ApiAuthContext;
}

const knownWorkosAuthErrors = new Set([
  "missing_auth_context",
]);
export function createWorkosAuthMiddleware() {
  return createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
    try {
      if (!c.req.raw.headers.has("cookie")) {
        throw new Error("missing_auth_context");
      }

      const { resolveApiAuthContextFromSession } = await import("@/lib/workos/auth");
      const authFromSession = await resolveApiAuthContextFromSession();

      if (!authFromSession) {
        throw new Error("missing_auth_context");
      }

      c.set("auth", authFromSession);
    } catch (error) {
      const message = error instanceof Error ? error.message : "unauthorized";

      if (!knownWorkosAuthErrors.has(message)) {
        throw error;
      }

      const status = message === "missing_auth_context" ? 401 : 400;

      return c.json(
        {
          error: status === 401 ? "unauthorized" : "invalid_auth_context",
        },
        status,
      );
    }

    await next();
  });
}

export const workosAuthMiddleware = createWorkosAuthMiddleware();
