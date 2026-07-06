import { and, desc, eq } from "drizzle-orm";

import { schema } from "@/lib/database";
import { getActiveOrganizationExternalTmsProviderCredentialRow } from "@/lib/providers/credentials/organization-external-tms-provider-credentials";
import {
  listTmsProviderLiveProjects,
  TmsProviderLiveError,
} from "@/lib/providers/jobs/tms-provider-live";
import type { ToolContext } from "@/lib/tools/types";

import { toolAccessibleProjectsWhere } from "@/lib/tools/tool-access";

export type AgentProjectSummary = {
  id: string;
  name: string;
  description: string;
  translationContext: string;
  source?: "native" | "external_tms";
  externalProviderKind?: string | null;
  externalProjectId?: string | null;
};

const TMS_USER_CONNECTION_ERROR_MESSAGES: Record<string, string> = {
  crowdin_user_connection_required: "Connect your Crowdin account before listing Crowdin projects.",
  crowdin_user_connection_auth_mode_mismatch:
    "Reconnect your Crowdin account after the workspace authentication mode changed.",
  phrase_user_connection_required: "Connect your Phrase account before listing Phrase projects.",
  lokalise_user_connection_required:
    "Connect your Lokalise account before listing Lokalise projects.",
};

function mapTmsProviderLiveError(error: TmsProviderLiveError) {
  if (error.code === "crowdin_user_connection_required") {
    return TMS_USER_CONNECTION_ERROR_MESSAGES.crowdin_user_connection_required;
  }
  if (error.code === "crowdin_user_connection_auth_mode_mismatch") {
    return TMS_USER_CONNECTION_ERROR_MESSAGES.crowdin_user_connection_auth_mode_mismatch;
  }
  if (error.code === "phrase_user_connection_required") {
    return TMS_USER_CONNECTION_ERROR_MESSAGES.phrase_user_connection_required;
  }
  if (error.code === "lokalise_user_connection_required") {
    return TMS_USER_CONNECTION_ERROR_MESSAGES.lokalise_user_connection_required;
  }
  if (error.code === "crowdin_auth_invalid" || error.code === "crowdin_user_auth_invalid") {
    return "Your Crowdin connection is invalid. Reconnect Crowdin and try again.";
  }

  return error.message;
}

export async function listAgentProjects(
  ctx: ToolContext,
  limit: number,
): Promise<{ projects: AgentProjectSummary[]; error?: string }> {
  const nativeProjects = await ctx.db
    .select({
      id: schema.projects.id,
      name: schema.projects.name,
      description: schema.projects.description,
      translationContext: schema.projects.translationContext,
    })
    .from(schema.projects)
    .where(and(await toolAccessibleProjectsWhere(ctx), eq(schema.projects.source, "native")))
    .orderBy(desc(schema.projects.createdAt));

  const credential = await getActiveOrganizationExternalTmsProviderCredentialRow(
    ctx.organizationId,
  );
  if (!credential) {
    return {
      projects: nativeProjects.slice(0, limit).map((project) => ({
        ...project,
        source: "native" as const,
      })),
    };
  }

  try {
    const liveProjects = await listTmsProviderLiveProjects(ctx.organizationId, {
      actorUserId: ctx.localUserId,
    });

    const projects = [
      ...liveProjects.map((project) => ({
        id: project.id,
        name: project.name,
        description: project.description ?? "",
        translationContext: project.translationContext ?? "",
        source: project.source,
        externalProviderKind: project.externalProviderKind,
        externalProjectId: project.externalProjectId,
      })),
      ...nativeProjects.map((project) => ({
        ...project,
        source: "native" as const,
      })),
    ].slice(0, limit);

    return { projects };
  } catch (error) {
    if (error instanceof TmsProviderLiveError) {
      return {
        projects: nativeProjects.slice(0, limit).map((project) => ({
          ...project,
          source: "native" as const,
        })),
        error: mapTmsProviderLiveError(error),
      };
    }

    throw error;
  }
}
