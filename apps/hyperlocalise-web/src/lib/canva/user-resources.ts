import { and, desc, eq, isNotNull, ne } from "drizzle-orm";

import { buildAccessibleProjectsWhere } from "@/api/auth/team-access";
import type { CanvaOAuthSessionAuth } from "@/api/auth/canva-oauth";
import { buildApiAuthContextForCanvaUser } from "@/api/auth/canva-oauth-access";
import { db, schema } from "@/lib/database";
import { REPLACING_WORKOS_MEMBERSHIP_ID } from "@/lib/workos/constants";

export type CanvaOrganizationSummary = {
  id: string;
  name: string;
  slug: string | null;
  role: string;
};

export type CanvaProjectSummary = {
  id: string;
  name: string;
  sourceLocale: string | null;
  targetLocales: string[];
};

export async function listCanvaUserOrganizations(
  userId: string,
): Promise<CanvaOrganizationSummary[]> {
  const rows = await db
    .select({
      id: schema.organizations.id,
      name: schema.organizations.name,
      slug: schema.organizations.slug,
      role: schema.organizationMemberships.role,
    })
    .from(schema.organizationMemberships)
    .innerJoin(
      schema.organizations,
      eq(schema.organizationMemberships.organizationId, schema.organizations.id),
    )
    .where(
      and(
        eq(schema.organizationMemberships.userId, userId),
        isNotNull(schema.organizationMemberships.workosMembershipId),
        ne(schema.organizationMemberships.workosMembershipId, REPLACING_WORKOS_MEMBERSHIP_ID),
      ),
    )
    .orderBy(desc(schema.organizations.name));

  return rows;
}

export async function listCanvaUserProjects(input: {
  session: CanvaOAuthSessionAuth;
  organizationId: string;
}): Promise<CanvaProjectSummary[] | null> {
  const auth = await buildApiAuthContextForCanvaUser({
    session: input.session,
    organizationId: input.organizationId,
  });

  if (!auth) {
    return null;
  }

  const rows = await db
    .select({
      id: schema.projects.id,
      name: schema.projects.name,
      sourceLocale: schema.projects.sourceLocale,
      targetLocales: schema.projects.targetLocales,
    })
    .from(schema.projects)
    .where(await buildAccessibleProjectsWhere(auth))
    .orderBy(desc(schema.projects.updatedAt));

  return rows.map((project) => ({
    id: project.id,
    name: project.name,
    sourceLocale: project.sourceLocale,
    targetLocales: project.targetLocales ?? [],
  }));
}

export async function getCanvaBrandOrgBinding(canvaBrandId: string) {
  const [binding] = await db
    .select({
      organizationId: schema.canvaBrandOrgBindings.organizationId,
      organizationName: schema.organizations.name,
      organizationSlug: schema.organizations.slug,
    })
    .from(schema.canvaBrandOrgBindings)
    .innerJoin(
      schema.organizations,
      eq(schema.canvaBrandOrgBindings.organizationId, schema.organizations.id),
    )
    .where(eq(schema.canvaBrandOrgBindings.canvaBrandId, canvaBrandId))
    .limit(1);

  return binding ?? null;
}

export async function upsertCanvaBrandOrgBinding(input: {
  canvaBrandId: string;
  organizationId: string;
  userId: string;
}) {
  await db
    .insert(schema.canvaBrandOrgBindings)
    .values({
      canvaBrandId: input.canvaBrandId,
      organizationId: input.organizationId,
      boundByUserId: input.userId,
    })
    .onConflictDoUpdate({
      target: schema.canvaBrandOrgBindings.canvaBrandId,
      set: {
        organizationId: input.organizationId,
        boundByUserId: input.userId,
        updatedAt: new Date(),
      },
    });
}

export async function touchCanvaOAuthBrand(input: { sessionId: string; canvaBrandId: string }) {
  await db
    .update(schema.canvaOauthSessions)
    .set({
      canvaBrandId: input.canvaBrandId,
      lastUsedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(schema.canvaOauthSessions.id, input.sessionId));
}
