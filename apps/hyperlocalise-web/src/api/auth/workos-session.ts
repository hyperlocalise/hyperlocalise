import { and, eq, inArray } from "drizzle-orm";
import { withAuth } from "@workos-inc/authkit-nextjs";

import { getVisibleTeamIds, hasOrganizationWideProjectAccess } from "@/api/auth/team-access";
import { enrichAuthContextWithCapabilities } from "@/api/auth/policy";
import type { ApiAuthContext } from "@/api/auth/workos";
import { db, schema } from "@/lib/database";

type ResolveApiAuthContextOptions = {
  cookie?: string;
  organizationSlug?: string;
  teamSlug?: string;
  session?: Awaited<ReturnType<typeof withAuth>>;
};

type OrganizationMembershipRecord = {
  workosUserId: string;
  localUserId: string;
  email: string;
  workosOrganizationId: string;
  localOrganizationId: string;
  organizationName: string;
  organizationSlug: string | null;
  workosMembershipId: string | null;
  role: ApiAuthContext["membership"]["role"];
};

export class StaleOrganizationSlugError extends Error {
  constructor(
    readonly requestedSlug: string,
    readonly currentSlug: string,
  ) {
    super("stale_organization_slug");
  }
}

async function resolveStaleSlugRedirectTarget(input: {
  requestedSlug: string;
  organizations: ApiAuthContext["organizations"];
  workosOrganizationId?: string | null;
  workosUserId: string;
}): Promise<string | null> {
  const { organizations, workosOrganizationId, requestedSlug, workosUserId } = input;

  if (workosOrganizationId) {
    const sessionOrganization = organizations.find(
      (item) => item.workosOrganizationId === workosOrganizationId && item.slug,
    );
    if (sessionOrganization?.slug && sessionOrganization.slug !== requestedSlug) {
      return sessionOrganization.slug;
    }
  }

  const [archivedMembership] = await db
    .select({ id: schema.organizations.id })
    .from(schema.organizationMemberships)
    .innerJoin(schema.users, eq(schema.organizationMemberships.userId, schema.users.id))
    .innerJoin(
      schema.organizations,
      eq(schema.organizationMemberships.organizationId, schema.organizations.id),
    )
    .where(
      and(
        eq(schema.users.workosUserId, workosUserId),
        eq(schema.organizations.slug, requestedSlug),
        eq(schema.organizations.lifecycleStatus, "archived"),
      ),
    )
    .limit(1);

  if (!archivedMembership) {
    return null;
  }

  const activeSlug = organizations.find((item) => item.slug)?.slug;
  if (activeSlug) {
    return activeSlug;
  }

  throw new Error("archived_organization_access");
}

async function selectActiveOrganization(
  organizations: ApiAuthContext["organizations"],
  options: {
    organizationSlug?: string;
    workosOrganizationId?: string | null;
    workosUserId: string;
  },
) {
  if (options.organizationSlug) {
    const organization = organizations.find((item) => item.slug === options.organizationSlug);

    if (!organization) {
      const currentSlug = await resolveStaleSlugRedirectTarget({
        requestedSlug: options.organizationSlug,
        organizations,
        workosOrganizationId: options.workosOrganizationId,
        workosUserId: options.workosUserId,
      });

      if (currentSlug) {
        throw new StaleOrganizationSlugError(options.organizationSlug, currentSlug);
      }

      throw new Error("organization_access_denied");
    }

    return organization;
  }

  if (options.workosOrganizationId) {
    const organization = organizations.find(
      (item) => item.workosOrganizationId === options.workosOrganizationId,
    );

    if (organization) {
      return organization;
    }
  }

  return organizations[0] ?? null;
}

async function resolveActiveTeam(
  auth: Pick<ApiAuthContext, "user" | "activeOrganization" | "membership">,
  teamSlug?: string,
): Promise<ApiAuthContext["activeTeam"]> {
  const organizationId = auth.activeOrganization.localOrganizationId;
  const visibleTeamIds = await getVisibleTeamIds({
    user: auth.user,
    activeOrganization: auth.activeOrganization,
    membership: auth.membership,
  } as ApiAuthContext);

  if (visibleTeamIds.length === 0) {
    return null;
  }

  const teamConditions = [
    eq(schema.teams.organizationId, organizationId),
    inArray(schema.teams.id, visibleTeamIds),
  ];

  if (teamSlug) {
    teamConditions.push(eq(schema.teams.slug, teamSlug));
  }

  const [team] = await db
    .select({
      id: schema.teams.id,
      slug: schema.teams.slug,
      name: schema.teams.name,
    })
    .from(schema.teams)
    .where(and(...teamConditions))
    .orderBy(schema.teams.slug)
    .limit(1);

  if (!team) {
    return null;
  }

  return resolveActiveTeamMembership(auth, team);
}

async function resolveActiveTeamMembership(
  auth: Pick<ApiAuthContext, "user" | "membership">,
  team: { id: string; slug: string; name: string },
): Promise<ApiAuthContext["activeTeam"]> {
  if (hasOrganizationWideProjectAccess({ membership: auth.membership } as ApiAuthContext)) {
    return {
      id: team.id,
      slug: team.slug,
      name: team.name,
      role: "manager",
    };
  }

  const [membership] = await db
    .select({ role: schema.teamMemberships.role })
    .from(schema.teamMemberships)
    .where(
      and(
        eq(schema.teamMemberships.teamId, team.id),
        eq(schema.teamMemberships.userId, auth.user.localUserId),
      ),
    )
    .limit(1);

  if (!membership) {
    return null;
  }

  return {
    id: team.id,
    slug: team.slug,
    name: team.name,
    role: membership.role,
  };
}

export async function resolveApiAuthContextFromSession(
  options: ResolveApiAuthContextOptions = {},
): Promise<ApiAuthContext | null> {
  const session = options.session ?? (await withAuth());

  if (!session.user) {
    return null;
  }

  const memberships = await db
    .select({
      workosUserId: schema.users.workosUserId,
      localUserId: schema.users.id,
      email: schema.users.email,
      workosOrganizationId: schema.organizations.workosOrganizationId,
      localOrganizationId: schema.organizations.id,
      organizationName: schema.organizations.name,
      organizationSlug: schema.organizations.slug,
      workosMembershipId: schema.organizationMemberships.workosMembershipId,
      role: schema.organizationMemberships.role,
    })
    .from(schema.organizationMemberships)
    .innerJoin(schema.users, eq(schema.organizationMemberships.userId, schema.users.id))
    .innerJoin(
      schema.organizations,
      eq(schema.organizationMemberships.organizationId, schema.organizations.id),
    )
    .where(
      and(
        eq(schema.users.workosUserId, session.user.id),
        eq(schema.organizations.lifecycleStatus, "active"),
      ),
    )
    .orderBy(schema.organizations.name);

  const organizations =
    memberships.length === 0
      ? []
      : memberships.map((membership: OrganizationMembershipRecord) => ({
          workosOrganizationId: membership.workosOrganizationId,
          localOrganizationId: membership.localOrganizationId,
          name: membership.organizationName,
          slug: membership.organizationSlug,
          membership: {
            workosMembershipId: membership.workosMembershipId,
            role: membership.role,
          },
        }));

  if (organizations.length === 0 && !options.organizationSlug) {
    return null;
  }

  const activeOrganization = await selectActiveOrganization(organizations, {
    organizationSlug: options.organizationSlug,
    workosOrganizationId: session.organizationId,
    workosUserId: session.user.id,
  });

  if (!activeOrganization) {
    return null;
  }

  const membership = memberships.find(
    (item) => item.localOrganizationId === activeOrganization.localOrganizationId,
  );

  if (!membership) {
    return null;
  }

  const authBase = {
    user: {
      workosUserId: membership.workosUserId,
      localUserId: membership.localUserId,
      email: membership.email,
    },
    organizations,
    organization: activeOrganization,
    activeOrganization,
    membership: {
      workosMembershipId: activeOrganization.membership.workosMembershipId,
      role: activeOrganization.membership.role,
    },
  };

  const activeTeam = await resolveActiveTeam(authBase, options.teamSlug);

  return enrichAuthContextWithCapabilities({
    ...authBase,
    activeTeam,
  });
}
