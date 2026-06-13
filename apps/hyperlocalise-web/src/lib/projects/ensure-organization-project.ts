import { and, eq } from "drizzle-orm";

import { db, schema } from "@/lib/database";
import { createLogger } from "@/lib/log";
import { normalizeProjectId } from "@/lib/projects/project-id";
import { getActiveOrganizationExternalTmsProviderCredentialRow } from "@/lib/providers/organization-external-tms-provider-credentials";
import { getTmsProviderLiveProject } from "@/lib/providers/tms-provider-live";
import {
  encodeProviderProjectId,
  parseProviderProjectId,
} from "@/lib/providers/tms-provider-resource-id";
import { upsertExternalTmsProjectRecord } from "@/lib/projects/upsert-external-tms-project-record";
import { isTmsHybridSyncEnabled } from "@/lib/providers/tms-hybrid-sync-mode";
import { enqueueProviderProjectMaterializationSyncIntents } from "@/lib/providers/provider-sync-intent";
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";

const logger = createLogger("ensure-organization-project");

export type EnsureOrganizationProjectError = {
  code: "project_not_found";
  reason:
    | "invalid_project_id"
    | "native_project_missing"
    | "invalid_external_project_id"
    | "tms_provider_unavailable"
    | "tms_provider_mismatch"
    | "external_project_unavailable"
    | "external_project_id_collision";
  organizationId: string;
  projectId?: string;
  providerKind?: string;
  externalProjectId?: string;
  activeProviderKind?: string;
};

function projectNotFound(
  reason: EnsureOrganizationProjectError["reason"],
  details: Omit<EnsureOrganizationProjectError, "code" | "reason">,
): EnsureOrganizationProjectError {
  return {
    code: "project_not_found",
    reason,
    ...details,
  };
}

/**
 * Resolves a project id for org-scoped writes that require a `projects` row.
 * Native projects must already exist. External TMS projects are materialized
 * from the active provider when needed.
 */
export async function ensureOrganizationProjectRecord(input: {
  organizationId: string;
  projectId: string;
  userId?: string | null;
}): Promise<Result<string, EnsureOrganizationProjectError>> {
  const projectId = normalizeProjectId(input.projectId);
  if (typeof projectId !== "string" || projectId.length === 0) {
    const error = projectNotFound("invalid_project_id", {
      organizationId: input.organizationId,
      projectId: typeof input.projectId === "string" ? input.projectId : undefined,
    });
    logger.warn(error, "organization project resolution failed");
    return err(error);
  }

  const [existing] = await db
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(
      and(
        eq(schema.projects.organizationId, input.organizationId),
        eq(schema.projects.id, projectId),
      ),
    )
    .limit(1);

  if (existing) {
    logger.info(
      {
        organizationId: input.organizationId,
        projectId: existing.id,
        resolution: "existing_record",
      },
      "organization project resolved from database",
    );
    return ok(existing.id);
  }

  const encodedProject = parseProviderProjectId(projectId);
  if (!encodedProject) {
    const error = projectNotFound("native_project_missing", {
      organizationId: input.organizationId,
      projectId,
    });
    logger.warn(error, "organization project resolution failed");
    return err(error);
  }

  const credential = await getActiveOrganizationExternalTmsProviderCredentialRow(
    input.organizationId,
  );
  if (!credential) {
    const error = projectNotFound("tms_provider_unavailable", {
      organizationId: input.organizationId,
      projectId,
      providerKind: encodedProject.providerKind,
      externalProjectId: encodedProject.externalProjectId,
    });
    logger.warn(error, "organization project resolution failed");
    return err(error);
  }

  if (credential.providerKind !== encodedProject.providerKind) {
    const error = projectNotFound("tms_provider_mismatch", {
      organizationId: input.organizationId,
      projectId,
      providerKind: encodedProject.providerKind,
      externalProjectId: encodedProject.externalProjectId,
      activeProviderKind: credential.providerKind,
    });
    logger.warn(error, "organization project resolution failed");
    return err(error);
  }

  const liveProject = await getTmsProviderLiveProject(
    input.organizationId,
    encodedProject.externalProjectId,
    { actorUserId: input.userId },
  );
  if (!liveProject) {
    const error = projectNotFound("external_project_unavailable", {
      organizationId: input.organizationId,
      projectId,
      providerKind: encodedProject.providerKind,
      externalProjectId: encodedProject.externalProjectId,
    });
    logger.warn(error, "organization project resolution failed");
    return err(error);
  }

  const canonicalProjectId = encodeProviderProjectId(encodedProject);

  const [existingProjectOwner] = await db
    .select({ organizationId: schema.projects.organizationId })
    .from(schema.projects)
    .where(eq(schema.projects.id, canonicalProjectId))
    .limit(1);

  if (existingProjectOwner && existingProjectOwner.organizationId !== input.organizationId) {
    const error = projectNotFound("external_project_id_collision", {
      organizationId: input.organizationId,
      projectId,
      providerKind: encodedProject.providerKind,
      externalProjectId: encodedProject.externalProjectId,
    });
    logger.warn(error, "organization project resolution failed");
    return err(error);
  }

  await upsertExternalTmsProjectRecord({
    organizationId: input.organizationId,
    providerCredentialId: credential.id,
    liveProject,
    userId: input.userId,
  });

  logger.info(
    {
      organizationId: input.organizationId,
      projectId: canonicalProjectId,
      providerKind: encodedProject.providerKind,
      externalProjectId: encodedProject.externalProjectId,
      resolution: "materialized_external_tms",
    },
    "organization project materialized from external TMS provider",
  );

  if (isTmsHybridSyncEnabled()) {
    void enqueueProviderProjectMaterializationSyncIntents({
      organizationId: input.organizationId,
      providerCredentialId: credential.id,
      providerKind: encodedProject.providerKind,
      projectId: canonicalProjectId,
    }).catch((error) => {
      logger.warn(
        {
          organizationId: input.organizationId,
          projectId: canonicalProjectId,
          error: error instanceof Error ? error.message : "unknown_error",
        },
        "failed to enqueue provider materialization sync intents",
      );
    });
  }

  return ok(canonicalProjectId);
}

export function unwrapOrganizationProjectRecord(
  result: Result<string, EnsureOrganizationProjectError>,
): string {
  if (isErr(result)) {
    const {
      code,
      reason,
      organizationId,
      projectId,
      providerKind,
      externalProjectId,
      activeProviderKind,
    } = result.error;
    throw Object.assign(new Error(code), {
      reason,
      organizationId,
      projectId,
      providerKind,
      externalProjectId,
      activeProviderKind,
    });
  }

  return result.value;
}
