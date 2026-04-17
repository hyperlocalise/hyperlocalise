import { createMiddleware } from "hono/factory";
import { z } from "zod";

import * as schema from "@/lib/database/schema";
import { syncWorkosIdentity } from "@/api/auth/workos-sync";
import type { OrganizationMembershipRole } from "@/lib/database/types";

export const AUTH_CONTEXT_HEADER = "x-hyperlocalise-auth";

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

export interface IdentityResolver {
  resolve(identity: WorkosAuthIdentity): Promise<ApiAuthContext>;
}

type DatabaseClient = (typeof import("@/lib/database"))["db"];

const workosAuthIdentitySchema = z.object({
  user: z.object({
    workosUserId: z.string().min(1),
    email: z.email(),
    firstName: z.string().min(1).optional(),
    lastName: z.string().min(1).optional(),
    avatarUrl: z.url().optional(),
  }),
  organization: z.object({
    workosOrganizationId: z.string().min(1),
    name: z.string().min(1),
    slug: z.string().min(1).optional(),
  }),
  membership: z.object({
    workosMembershipId: z.string().min(1).optional(),
    role: z.enum(schema.organizationMembershipRoleEnum.enumValues),
  }),
});

const knownWorkosAuthErrors = new Set([
  "missing_auth_context",
  "invalid_auth_context",
  "incomplete_workos_headers",
  "invalid_membership_role",
  "membership_sync_failed",
]);

function readIdentityFromJsonHeader(headers: Headers): WorkosAuthIdentity | null {
  const raw = headers.get(AUTH_CONTEXT_HEADER);

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    return workosAuthIdentitySchema.parse(parsed);
  } catch {
    throw new Error("invalid_auth_context");
  }
}

function readIdentityFromWorkosHeaders(headers: Headers): WorkosAuthIdentity | null {
  const workosUserId = headers.get("x-workos-user-id");
  const email = headers.get("x-workos-user-email");
  const workosOrganizationId = headers.get("x-workos-organization-id");
  const organizationName = headers.get("x-workos-organization-name");
  const role = headers.get("x-workos-role");

  if (!workosUserId && !email && !workosOrganizationId && !organizationName && !role) {
    return null;
  }

  if (!workosUserId || !email || !workosOrganizationId || !organizationName || !role) {
    throw new Error("incomplete_workos_headers");
  }

  if (!isOrganizationMembershipRole(role)) {
    throw new Error("invalid_membership_role");
  }

  try {
    return workosAuthIdentitySchema.parse({
      user: {
        workosUserId,
        email,
        firstName: headers.get("x-workos-user-first-name") ?? undefined,
        lastName: headers.get("x-workos-user-last-name") ?? undefined,
        avatarUrl: headers.get("x-workos-user-avatar-url") ?? undefined,
      },
      organization: {
        workosOrganizationId,
        name: organizationName,
        slug: headers.get("x-workos-organization-slug") ?? undefined,
      },
      membership: {
        workosMembershipId: headers.get("x-workos-membership-id") ?? undefined,
        role,
      },
    });
  } catch {
    throw new Error("invalid_auth_context");
  }
}

function isOrganizationMembershipRole(value: string): value is OrganizationMembershipRole {
  return schema.organizationMembershipRoleEnum.enumValues.includes(
    value as OrganizationMembershipRole,
  );
}

export function parseWorkosIdentity(headers: Headers): WorkosAuthIdentity {
  const fromJson = readIdentityFromJsonHeader(headers);

  if (fromJson) {
    return fromJson;
  }

  const fromHeaders = readIdentityFromWorkosHeaders(headers);

  if (fromHeaders) {
    return fromHeaders;
  }

  throw new Error("missing_auth_context");
}

export class DatabaseIdentityResolver implements IdentityResolver {
  constructor(private readonly database?: DatabaseClient) {}

  async resolve(identity: WorkosAuthIdentity): Promise<ApiAuthContext> {
    const database = this.database ?? (await import("@/lib/database")).db;

    const { user, organization, membership } = await syncWorkosIdentity(database, identity);

    if (!membership) {
      throw new Error("membership_sync_failed");
    }

    return {
      user: {
        workosUserId: user.workosUserId,
        localUserId: user.id,
        email: user.email,
      },
      organization: {
        workosOrganizationId: organization.workosOrganizationId,
        localOrganizationId: organization.id,
        name: organization.name,
        slug: organization.slug,
      },
      membership: {
        workosMembershipId: membership.workosMembershipId,
        role: membership.role,
      },
    };
  }
}

export function createWorkosAuthMiddleware(
  resolver: IdentityResolver = new DatabaseIdentityResolver(),
) {
  return createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
    try {
      const authFromJsonHeader = readIdentityFromJsonHeader(c.req.raw.headers);

      if (authFromJsonHeader) {
        const auth = await resolver.resolve(authFromJsonHeader);
        c.set("auth", auth);
      } else {
        const authFromWorkosHeaders = readIdentityFromWorkosHeaders(c.req.raw.headers);

        if (authFromWorkosHeaders) {
          const auth = await resolver.resolve(authFromWorkosHeaders);
          c.set("auth", auth);
        } else if (c.req.raw.headers.has("cookie")) {
          const { resolveApiAuthContextFromSession } = await import("@/lib/workos/auth");
          const authFromSession = await resolveApiAuthContextFromSession();

          if (!authFromSession) {
            throw new Error("missing_auth_context");
          }

          c.set("auth", authFromSession);
        } else {
          throw new Error("missing_auth_context");
        }
      }
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
