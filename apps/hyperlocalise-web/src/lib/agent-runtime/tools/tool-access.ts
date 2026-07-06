import { and, eq } from "drizzle-orm";

import {
  buildAccessibleJobsWhere,
  buildAccessibleProjectsWhere,
  buildProjectLinkedGlossaryWhere,
  buildProjectLinkedMemoryWhere,
  canAccessGlossary,
  canAccessMemory,
  canAccessStoredFile,
  ownedProjectWhere,
} from "@/api/auth/team-access";
import type { ApiAuthContext } from "@/api/auth/workos";
import { schema } from "@/lib/database";
import type { ToolContext } from "@/lib/agent-contracts/tool-context";
import { getTmsProviderLiveProject } from "@/lib/providers/jobs/tms-provider-live";
import {
  isLiveProviderGlossaryId,
  isLiveProviderMemoryId,
  parseProviderProjectId,
} from "@/lib/providers/jobs/tms-provider-resource-id";
import { normalizeProjectId } from "@/lib/projects/identity/project-id";
import { resolveOrganizationMembershipAccessSource } from "@/lib/workos/membership-access";

function organizationRecord(ctx: ToolContext) {
  return {
    workosOrganizationId: "",
    localOrganizationId: ctx.organizationId,
    name: "",
    slug: null as string | null,
    membership: {
      workosMembershipId: null as string | null,
      role: ctx.membershipRole,
      accessSource: resolveOrganizationMembershipAccessSource(null),
    },
  };
}

/** Minimal auth snapshot so agent tools reuse REST API team scoping. */
export function apiAuthContextFromToolContext(ctx: ToolContext): ApiAuthContext {
  const organization = organizationRecord(ctx);

  return {
    user: {
      workosUserId: "",
      localUserId: ctx.localUserId,
      email: "",
    },
    organizations: [],
    organization,
    activeOrganization: organization,
    membership: organization.membership,
    activeTeam: null,
    capabilities: [],
  };
}

export function toolAccessibleProjectsWhere(ctx: ToolContext) {
  return buildAccessibleProjectsWhere(apiAuthContextFromToolContext(ctx));
}

export function toolAccessibleJobsWhere(ctx: ToolContext) {
  return buildAccessibleJobsWhere(apiAuthContextFromToolContext(ctx));
}

export function toolProjectLinkedGlossaryWhere(ctx: ToolContext) {
  return buildProjectLinkedGlossaryWhere(apiAuthContextFromToolContext(ctx));
}

export function toolProjectLinkedMemoryWhere(ctx: ToolContext) {
  return buildProjectLinkedMemoryWhere(apiAuthContextFromToolContext(ctx));
}

export async function toolCanAccessProject(ctx: ToolContext, projectId: string) {
  const normalizedProjectId = normalizeProjectId(projectId);
  if (typeof normalizedProjectId !== "string" || normalizedProjectId.length === 0) {
    return null;
  }

  const auth = apiAuthContextFromToolContext(ctx);

  const [project] = await ctx.db
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(await ownedProjectWhere(auth, normalizedProjectId))
    .limit(1);

  if (project) {
    return project;
  }

  const encodedProject = parseProviderProjectId(normalizedProjectId);
  if (!encodedProject) {
    return null;
  }

  const [organizationProject] = await ctx.db
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(
      and(
        eq(schema.projects.organizationId, ctx.organizationId),
        eq(schema.projects.id, normalizedProjectId),
      ),
    )
    .limit(1);

  if (organizationProject) {
    return null;
  }

  const liveProject = await getTmsProviderLiveProject(
    ctx.organizationId,
    encodedProject.externalProjectId,
    { actorUserId: ctx.localUserId },
  ).catch(() => null);

  if (!liveProject || liveProject.id !== normalizedProjectId) {
    return null;
  }

  return { id: liveProject.id };
}

export function toolCanAccessGlossary(ctx: ToolContext, glossaryId: string) {
  return canAccessGlossary(apiAuthContextFromToolContext(ctx), glossaryId);
}

export function toolCanAccessMemory(ctx: ToolContext, memoryId: string) {
  return canAccessMemory(apiAuthContextFromToolContext(ctx), memoryId);
}

/** Single-query glossary fetch with team scoping (replaces check + select). */
export async function toolGetAccessibleGlossary(ctx: ToolContext, glossaryId: string) {
  if (isLiveProviderGlossaryId(glossaryId)) {
    return null;
  }

  const [glossary] = await ctx.db
    .select()
    .from(schema.glossaries)
    .where(and(eq(schema.glossaries.id, glossaryId), await toolProjectLinkedGlossaryWhere(ctx)))
    .limit(1);

  return glossary ?? null;
}

/** Single-query memory fetch with team scoping (replaces check + select). */
export async function toolGetAccessibleMemory(ctx: ToolContext, memoryId: string) {
  if (isLiveProviderMemoryId(memoryId)) {
    return null;
  }

  const [memory] = await ctx.db
    .select()
    .from(schema.memories)
    .where(and(eq(schema.memories.id, memoryId), await toolProjectLinkedMemoryWhere(ctx)))
    .limit(1);

  return memory ?? null;
}

export function toolGlossaryOrgMutationWhere(ctx: ToolContext, glossaryId: string) {
  return and(
    eq(schema.glossaries.id, glossaryId),
    eq(schema.glossaries.organizationId, ctx.organizationId),
  );
}

export function toolMemoryOrgMutationWhere(ctx: ToolContext, memoryId: string) {
  return and(
    eq(schema.memories.id, memoryId),
    eq(schema.memories.organizationId, ctx.organizationId),
  );
}

export async function toolCanAccessStoredFileProject(
  ctx: ToolContext,
  projectId: string | null,
  createdByUserId?: string | null,
) {
  return canAccessStoredFile(apiAuthContextFromToolContext(ctx), {
    organizationId: ctx.organizationId,
    projectId,
    createdByUserId,
  });
}
