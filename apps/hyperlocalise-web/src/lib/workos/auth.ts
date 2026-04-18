import { getWorkOS, type UserInfo, withAuth } from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";

import { syncWorkosIdentity, syncWorkosUser } from "@/api/auth/workos-sync";
import type { ApiAuthContext, WorkosAuthIdentity } from "@/api/auth/workos";
import { db } from "@/lib/database";
import type { OrganizationMembershipRole } from "@/lib/database/types";

type WorkosSdkMembership = {
  id: string;
  organizationId: string;
  role?: {
    slug?: string | null;
  } | null;
  status?: string | null;
};

type WorkosSdkOrganization = {
  id: string;
  name: string;
  slug?: string | null;
};

type AccessTokenClaims = {
  org_id?: string;
  role?: string;
};

export type WorkosOrganizationOption = {
  workosOrganizationId: string;
  name: string;
  slug?: string;
  workosMembershipId: string;
  role: OrganizationMembershipRole;
  status: string;
};

type ReadyState = {
  user: UserInfo["user"];
  auth: ApiAuthContext;
};

function normalizeRole(value: string | null | undefined): OrganizationMembershipRole {
  if (value === "owner" || value === "admin" || value === "member") {
    return value;
  }

  return "member";
}

function parseJwtClaims(token: string): AccessTokenClaims {
  const [, payload = ""] = token.split(".");

  if (!payload) {
    return {};
  }

  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const decoded = Buffer.from(padded, "base64").toString("utf8");

    return JSON.parse(decoded) as AccessTokenClaims;
  } catch {
    return {};
  }
}

function getActiveOrganizationId(
  session:
    | Pick<UserInfo, "organizationId">
    | {
        accessToken: string;
      },
) {
  if ("organizationId" in session) {
    return session.organizationId ?? undefined;
  }

  if (!("accessToken" in session)) {
    return undefined;
  }

  const claims = parseJwtClaims(session.accessToken);
  return claims.org_id;
}

async function listUserOrganizations(userId: string): Promise<WorkosOrganizationOption[]> {
  const workos = getWorkOS();
  const membershipsResponse = await workos.userManagement.listOrganizationMemberships({
    userId,
    limit: 100,
  });

  const memberships = (membershipsResponse.data as WorkosSdkMembership[]).filter(
    (membership) => membership.status === "active",
  );

  const organizationIds = [...new Set(memberships.map((membership) => membership.organizationId))];
  const organizationsResponse = await Promise.all(
    organizationIds.map((organizationId) => workos.organizations.getOrganization(organizationId)),
  );
  const organizationsById = new Map(
    (organizationsResponse as WorkosSdkOrganization[]).map((organization) => [
      organization.id,
      organization,
    ]),
  );

  const organizations = memberships.flatMap((membership) => {
    const organization = organizationsById.get(membership.organizationId);

    if (!organization) {
      return [];
    }

    return {
      workosOrganizationId: organization.id,
      name: organization.name,
      slug: organization.slug ?? undefined,
      workosMembershipId: membership.id,
      role: normalizeRole(membership.role?.slug),
      status: membership.status ?? "active",
    } satisfies WorkosOrganizationOption;
  });

  return organizations;
}

async function syncUserProfile(user: UserInfo["user"]) {
  return syncWorkosUser(db, {
    workosUserId: user.id,
    email: user.email,
    firstName: user.firstName ?? undefined,
    lastName: user.lastName ?? undefined,
    avatarUrl: user.profilePictureUrl ?? undefined,
  });
}

async function syncIdentityFromSelection(input: {
  user: UserInfo["user"];
  organization: WorkosOrganizationOption;
}): Promise<ApiAuthContext> {
  const identity: WorkosAuthIdentity = {
    user: {
      workosUserId: input.user.id,
      email: input.user.email,
      firstName: input.user.firstName ?? undefined,
      lastName: input.user.lastName ?? undefined,
      avatarUrl: input.user.profilePictureUrl ?? undefined,
    },
    organization: {
      workosOrganizationId: input.organization.workosOrganizationId,
      name: input.organization.name,
      slug: input.organization.slug,
    },
    membership: {
      workosMembershipId: input.organization.workosMembershipId,
      role: input.organization.role,
    },
  };

  const { user, organization, membership } = await syncWorkosIdentity(db, identity);

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

export async function syncWorkosCallbackUser(input: {
  user: UserInfo["user"];
  organizationId?: string;
}) {
  await syncUserProfile(input.user);

  if (!input.organizationId) {
    return;
  }

  const organizations = await listUserOrganizations(input.user.id);
  const activeOrganization = organizations.find(
    (organization) => organization.workosOrganizationId === input.organizationId,
  );

  if (!activeOrganization) {
    return;
  }

  await syncIdentityFromSelection({
    user: input.user,
    organization: activeOrganization,
  });
}

async function resolveApiAuthContext(
  session:
    | Pick<UserInfo, "user" | "organizationId">
    | {
        user: UserInfo["user"] | null;
        organizationId?: string;
        accessToken?: string;
      },
): Promise<ApiAuthContext | null> {
  if (!session.user) {
    return null;
  }

  const organizations = await listUserOrganizations(session.user.id);
  const activeOrganizationId =
    session.organizationId ?? (session.accessToken ? getActiveOrganizationId(session) : undefined);

  if (!activeOrganizationId) {
    return null;
  }

  const activeOrganization = organizations.find(
    (organization) => organization.workosOrganizationId === activeOrganizationId,
  );

  if (!activeOrganization) {
    return null;
  }

  return syncIdentityFromSelection({
    user: session.user,
    organization: activeOrganization,
  });
}

export async function requireWorkosAppAuth(): Promise<ReadyState> {
  const session = await withAuth({ ensureSignedIn: true });

  await syncUserProfile(session.user);

  const auth = await resolveApiAuthContext(session);

  if (!auth) {
    redirect("/auth/access-denied");
  }

  return {
    user: session.user,
    auth,
  };
}

export async function resolveApiAuthContextFromSession(): Promise<ApiAuthContext | null> {
  return resolveApiAuthContext(await withAuth());
}
