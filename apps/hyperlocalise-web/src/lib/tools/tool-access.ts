import {
  buildAccessibleJobsWhere,
  buildAccessibleProjectsWhere,
  buildProjectLinkedGlossaryWhere,
  buildProjectLinkedMemoryWhere,
  canAccessGlossary,
  canAccessMemory,
  ownedProjectWhere,
} from "@/api/auth/team-access";
import type { ApiAuthContext } from "@/api/auth/workos";
import { schema } from "@/lib/database";

import type { ToolContext } from "./types";

function organizationRecord(ctx: ToolContext) {
  return {
    workosOrganizationId: "",
    localOrganizationId: ctx.organizationId,
    name: "",
    slug: null as string | null,
    membership: {
      workosMembershipId: null as string | null,
      role: ctx.membershipRole,
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
    membership: {
      workosMembershipId: null,
      role: ctx.membershipRole,
    },
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
  const [project] = await ctx.db
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(await ownedProjectWhere(apiAuthContextFromToolContext(ctx), projectId))
    .limit(1);

  return project ?? null;
}

export function toolCanAccessGlossary(ctx: ToolContext, glossaryId: string) {
  return canAccessGlossary(apiAuthContextFromToolContext(ctx), glossaryId);
}

export function toolCanAccessMemory(ctx: ToolContext, memoryId: string) {
  return canAccessMemory(apiAuthContextFromToolContext(ctx), memoryId);
}

export async function toolCanAccessStoredFileProject(ctx: ToolContext, projectId: string | null) {
  if (!projectId) {
    return true;
  }

  return Boolean(await toolCanAccessProject(ctx, projectId));
}
