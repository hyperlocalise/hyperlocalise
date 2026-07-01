import { redirect } from "next/navigation";
import { and, eq, isNull, or } from "drizzle-orm";

import { db, schema } from "@/lib/database";
import { REPLACING_WORKOS_MEMBERSHIP_ID } from "@/lib/workos/constants";

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
    .where(
      and(
        eq(schema.users.email, normalizedEmail),
        eq(schema.organizations.lifecycleStatus, "active"),
        or(
          isNull(schema.organizationMemberships.workosMembershipId),
          eq(schema.organizationMemberships.workosMembershipId, REPLACING_WORKOS_MEMBERSHIP_ID),
        ),
      ),
    )
    .limit(1);

  return Boolean(membership);
}

export async function redirectForMissingOrganizationAccess(email: string): Promise<never> {
  if (await hasPendingOrganizationMembership(email)) {
    redirect("/auth/access-denied?reason=pending-invite");
  }

  redirect("/auth/onboarding");
}
