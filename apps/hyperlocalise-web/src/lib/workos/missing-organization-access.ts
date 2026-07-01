import { redirect } from "next/navigation";
import { and, eq, isNull, or } from "drizzle-orm";

import { reconcileWorkosMembershipsForUser } from "@/api/auth/workos-membership-reconcile";
import { db, schema } from "@/lib/database";
import { REPLACING_WORKOS_MEMBERSHIP_ID } from "@/lib/workos/constants";

const pendingMembershipConditions = [
  eq(schema.organizations.lifecycleStatus, "active"),
  or(
    isNull(schema.organizationMemberships.workosMembershipId),
    eq(schema.organizationMemberships.workosMembershipId, REPLACING_WORKOS_MEMBERSHIP_ID),
  ),
];

export async function hasPendingOrganizationMembership(email: string): Promise<boolean> {
  const normalizedEmail = email.trim().toLowerCase();

  const [membership] = await db
    .select({ id: schema.organizationMemberships.id })
    .from(schema.organizationMemberships)
    .innerJoin(schema.users, eq(schema.organizationMemberships.userId, schema.users.id))
    .innerJoin(
      schema.organizations,
      eq(schema.organizationMemberships.organizationId, schema.organizations.id),
    )
    .where(and(eq(schema.users.email, normalizedEmail), ...pendingMembershipConditions))
    .limit(1);

  return Boolean(membership);
}

export async function hasPendingOrganizationMembershipForWorkosUser(
  workosUserId: string,
): Promise<boolean> {
  const [membership] = await db
    .select({ id: schema.organizationMemberships.id })
    .from(schema.organizationMemberships)
    .innerJoin(schema.users, eq(schema.organizationMemberships.userId, schema.users.id))
    .innerJoin(
      schema.organizations,
      eq(schema.organizationMemberships.organizationId, schema.organizations.id),
    )
    .where(and(eq(schema.users.workosUserId, workosUserId), ...pendingMembershipConditions))
    .limit(1);

  return Boolean(membership);
}

type RedirectForMissingOrganizationAccessInput = {
  email: string;
  workosUserId?: string;
};

export async function redirectForMissingOrganizationAccess(
  input: RedirectForMissingOrganizationAccessInput | string,
): Promise<never> {
  const { email, workosUserId } =
    typeof input === "string" ? { email: input, workosUserId: undefined } : input;

  if (await hasPendingOrganizationMembership(email)) {
    if (workosUserId) {
      await reconcileWorkosMembershipsForUser(db, {
        workosUserId,
        email,
        force: true,
      });

      if (!(await hasPendingOrganizationMembership(email))) {
        redirect("/dashboard");
      }
    }

    redirect("/auth/access-denied?reason=pending-invite");
  }

  redirect("/auth/onboarding");
}
