import { and, eq, exists, inArray, isNull, or, sql, type SQL } from "drizzle-orm";

import { hasCapability } from "@/api/auth/policy";
import type { ApiAuthContext } from "@/api/auth/workos";
import { db, schema } from "@/lib/database";
import { backfillOrganizationProjectTeams } from "@/lib/teams/default-workspace-team";

export function hasOrganizationWideProjectAccess(auth: ApiAuthContext) {
  return hasCapability(auth.membership.role, "teams:write");
}

export async function getVisibleTeamIds(auth: ApiAuthContext) {
  const organizationId = auth.activeOrganization.localOrganizationId;

  if (hasOrganizationWideProjectAccess(auth)) {
    const teams = await db
      .select({ id: schema.teams.id })
      .from(schema.teams)
      .where(eq(schema.teams.organizationId, organizationId));

    return teams.map((team) => team.id);
  }

  const teams = await db
    .select({ id: schema.teams.id })
    .from(schema.teamMemberships)
    .innerJoin(schema.teams, eq(schema.teamMemberships.teamId, schema.teams.id))
    .where(
      and(
        eq(schema.teamMemberships.userId, auth.user.localUserId),
        eq(schema.teams.organizationId, organizationId),
      ),
    );

  return teams.map((team) => team.id);
}

export async function ensureOrganizationProjectTeamsBackfilled(organizationId: string) {
  const [projectMissingTeam] = await db
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(and(eq(schema.projects.organizationId, organizationId), isNull(schema.projects.teamId)))
    .limit(1);

  if (!projectMissingTeam) {
    return;
  }

  await backfillOrganizationProjectTeams(organizationId);
}

export async function buildAccessibleProjectsWhere(auth: ApiAuthContext): Promise<SQL> {
  const organizationId = auth.organization.localOrganizationId;
  await ensureOrganizationProjectTeamsBackfilled(organizationId);

  const organizationScope = eq(schema.projects.organizationId, organizationId);

  if (hasOrganizationWideProjectAccess(auth)) {
    return organizationScope;
  }

  const visibleTeamIds = await getVisibleTeamIds(auth);
  if (visibleTeamIds.length === 0) {
    return sql`false`;
  }

  return and(organizationScope, inArray(schema.projects.teamId, visibleTeamIds))!;
}

export async function ownedProjectWhere(auth: ApiAuthContext, projectId: string) {
  return and(eq(schema.projects.id, projectId), await buildAccessibleProjectsWhere(auth))!;
}

export async function getAccessibleProjectIds(auth: ApiAuthContext) {
  const projects = await db
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(await buildAccessibleProjectsWhere(auth));

  return projects.map((project) => project.id);
}

export async function buildAccessibleJobsWhere(auth: ApiAuthContext): Promise<SQL> {
  const organizationId = auth.organization.localOrganizationId;
  const organizationScope = eq(schema.jobs.organizationId, organizationId);

  if (hasOrganizationWideProjectAccess(auth)) {
    return organizationScope;
  }

  const accessibleProjectIds = await getAccessibleProjectIds(auth);

  if (accessibleProjectIds.length === 0) {
    return sql`false`;
  }

  return and(organizationScope, inArray(schema.jobs.projectId, accessibleProjectIds))!;
}

/** Personal My Jobs queries scope by assignment/ownership instead of team membership. */
export async function buildOrganizationJobsListWhere(
  auth: ApiAuthContext,
  options?: { relationship?: "assigned" | "created" },
): Promise<SQL> {
  const organizationScope = eq(schema.jobs.organizationId, auth.organization.localOrganizationId);

  if (options?.relationship === "assigned" || options?.relationship === "created") {
    return organizationScope;
  }

  return buildAccessibleJobsWhere(auth);
}

export async function buildProjectLinkedGlossaryWhere(auth: ApiAuthContext): Promise<SQL> {
  const organizationId = auth.organization.localOrganizationId;
  const organizationScope = eq(schema.glossaries.organizationId, organizationId);

  if (hasOrganizationWideProjectAccess(auth)) {
    return organizationScope;
  }

  const accessibleProjectIds = await getAccessibleProjectIds(auth);
  if (accessibleProjectIds.length === 0) {
    return sql`false`;
  }

  const linkedGlossaryIds = db
    .selectDistinct({ glossaryId: schema.projectGlossaries.glossaryId })
    .from(schema.projectGlossaries)
    .where(inArray(schema.projectGlossaries.projectId, accessibleProjectIds));

  return and(organizationScope, inArray(schema.glossaries.id, linkedGlossaryIds))!;
}

export async function buildProjectLinkedMemoryWhere(auth: ApiAuthContext): Promise<SQL> {
  const organizationId = auth.organization.localOrganizationId;
  const organizationScope = eq(schema.memories.organizationId, organizationId);

  if (hasOrganizationWideProjectAccess(auth)) {
    return organizationScope;
  }

  const accessibleProjectIds = await getAccessibleProjectIds(auth);
  if (accessibleProjectIds.length === 0) {
    return sql`false`;
  }

  const linkedMemoryIds = db
    .selectDistinct({ memoryId: schema.projectMemories.memoryId })
    .from(schema.projectMemories)
    .where(inArray(schema.projectMemories.projectId, accessibleProjectIds));

  return and(organizationScope, inArray(schema.memories.id, linkedMemoryIds))!;
}

export async function buildAccessibleInteractionsWhere(auth: ApiAuthContext): Promise<SQL> {
  const organizationId = auth.organization.localOrganizationId;
  const organizationScope = eq(schema.interactions.organizationId, organizationId);

  if (hasOrganizationWideProjectAccess(auth)) {
    return organizationScope;
  }

  const accessibleProjectIds = await getAccessibleProjectIds(auth);
  const ownedWorkspaceChatFilter = and(
    isNull(schema.interactions.projectId),
    eq(schema.interactions.source, "chat_ui"),
    exists(
      db
        .select({ id: schema.interactionMessages.id })
        .from(schema.interactionMessages)
        .where(
          and(
            eq(schema.interactionMessages.interactionId, schema.interactions.id),
            eq(schema.interactionMessages.senderType, "user"),
            eq(schema.interactionMessages.senderEmail, auth.user.email),
          ),
        )
        .limit(1),
    ),
  )!;

  const projectFilter =
    accessibleProjectIds.length > 0
      ? or(inArray(schema.interactions.projectId, accessibleProjectIds), ownedWorkspaceChatFilter)
      : ownedWorkspaceChatFilter;

  return and(organizationScope, projectFilter)!;
}

export async function canAccessInteraction(auth: ApiAuthContext, interactionId: string) {
  const where = await buildAccessibleInteractionsWhere(auth);

  const [interaction] = await db
    .select({
      id: schema.interactions.id,
      organizationId: schema.interactions.organizationId,
      projectId: schema.interactions.projectId,
      source: schema.interactions.source,
      title: schema.interactions.title,
      sourceThreadId: schema.interactions.sourceThreadId,
      lastMessageAt: schema.interactions.lastMessageAt,
      createdAt: schema.interactions.createdAt,
      updatedAt: schema.interactions.updatedAt,
      status: schema.inboxItems.status,
    })
    .from(schema.interactions)
    .innerJoin(schema.inboxItems, eq(schema.inboxItems.interactionId, schema.interactions.id))
    .where(and(eq(schema.interactions.id, interactionId), where))
    .limit(1);

  return interaction ?? null;
}

export async function canAccessGlossary(auth: ApiAuthContext, glossaryId: string) {
  if (hasOrganizationWideProjectAccess(auth)) {
    const [glossary] = await db
      .select({ id: schema.glossaries.id })
      .from(schema.glossaries)
      .where(
        and(
          eq(schema.glossaries.id, glossaryId),
          eq(schema.glossaries.organizationId, auth.organization.localOrganizationId),
        ),
      )
      .limit(1);

    return glossary ?? null;
  }

  const accessibleProjectIds = await getAccessibleProjectIds(auth);
  if (accessibleProjectIds.length === 0) {
    return null;
  }

  const [glossary] = await db
    .select({ id: schema.glossaries.id })
    .from(schema.glossaries)
    .innerJoin(
      schema.projectGlossaries,
      eq(schema.projectGlossaries.glossaryId, schema.glossaries.id),
    )
    .where(
      and(
        eq(schema.glossaries.id, glossaryId),
        eq(schema.glossaries.organizationId, auth.organization.localOrganizationId),
        inArray(schema.projectGlossaries.projectId, accessibleProjectIds),
      ),
    )
    .limit(1);

  return glossary ?? null;
}

export async function canAccessStoredFile(
  auth: ApiAuthContext,
  input: {
    organizationId: string;
    projectId: string | null;
    createdByUserId?: string | null;
  },
) {
  if (input.organizationId !== auth.organization.localOrganizationId) {
    return false;
  }

  if (input.projectId) {
    const [project] = await db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(await ownedProjectWhere(auth, input.projectId))
      .limit(1);

    return Boolean(project);
  }

  if (hasOrganizationWideProjectAccess(auth)) {
    return true;
  }

  const uploaderId = input.createdByUserId ?? null;
  if (uploaderId === null) {
    return true;
  }

  return uploaderId === auth.user.localUserId;
}

export async function canAccessMemory(auth: ApiAuthContext, memoryId: string) {
  if (hasOrganizationWideProjectAccess(auth)) {
    const [memory] = await db
      .select({ id: schema.memories.id })
      .from(schema.memories)
      .where(
        and(
          eq(schema.memories.id, memoryId),
          eq(schema.memories.organizationId, auth.organization.localOrganizationId),
        ),
      )
      .limit(1);

    return memory ?? null;
  }

  const accessibleProjectIds = await getAccessibleProjectIds(auth);
  if (accessibleProjectIds.length === 0) {
    return null;
  }

  const [memory] = await db
    .select({ id: schema.memories.id })
    .from(schema.memories)
    .innerJoin(schema.projectMemories, eq(schema.projectMemories.memoryId, schema.memories.id))
    .where(
      and(
        eq(schema.memories.id, memoryId),
        eq(schema.memories.organizationId, auth.organization.localOrganizationId),
        inArray(schema.projectMemories.projectId, accessibleProjectIds),
      ),
    )
    .limit(1);

  return memory ?? null;
}
