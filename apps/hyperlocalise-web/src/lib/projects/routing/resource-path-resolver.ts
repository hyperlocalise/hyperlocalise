import { and, eq, or } from "drizzle-orm";

import { db, schema } from "@/lib/database";
import { normalizeProjectId } from "@/lib/projects/identity/project-id";
import { getActiveOrganizationExternalTmsProviderCredentialRow } from "@/lib/providers/organization-external-tms-provider-credentials";
import {
  encodeProviderJobId,
  encodeProviderProjectId,
  parseProviderJobId,
  parseProviderProjectId,
} from "@/lib/providers/tms-provider-resource-id";

function normalizePathSegment(value: string) {
  const normalized = normalizeProjectId(value);
  return typeof normalized === "string" ? normalized : value;
}

export async function resolveCanonicalProjectId(
  organizationId: string,
  pathSegment: string,
): Promise<string> {
  const normalized = normalizePathSegment(pathSegment);
  const encodedProject = parseProviderProjectId(normalized);
  if (encodedProject) {
    return normalized;
  }

  const [projectById] = await db
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(
      and(eq(schema.projects.organizationId, organizationId), eq(schema.projects.id, normalized)),
    )
    .limit(1);

  if (projectById) {
    return projectById.id;
  }

  const [projectByExternalId] = await db
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(
      and(
        eq(schema.projects.organizationId, organizationId),
        eq(schema.projects.externalProjectId, normalized),
      ),
    )
    .limit(1);

  if (projectByExternalId) {
    return projectByExternalId.id;
  }

  const credential = await getActiveOrganizationExternalTmsProviderCredentialRow(organizationId);
  if (credential) {
    return encodeProviderProjectId({
      providerKind: credential.providerKind,
      externalProjectId: normalized,
    });
  }

  return normalized;
}

export async function resolveCanonicalJobId(
  canonicalProjectId: string,
  pathSegment: string,
): Promise<string> {
  const normalized = normalizePathSegment(pathSegment);
  const encodedJob = parseProviderJobId(normalized);
  if (encodedJob) {
    return normalized;
  }

  const [jobById] = await db
    .select({ id: schema.jobs.id })
    .from(schema.jobs)
    .leftJoin(schema.externalJobDetails, eq(schema.externalJobDetails.jobId, schema.jobs.id))
    .where(
      and(
        eq(schema.jobs.projectId, canonicalProjectId),
        or(
          eq(schema.jobs.id, normalized),
          eq(schema.externalJobDetails.externalJobId, normalized),
          eq(schema.externalJobDetails.externalTaskId, normalized),
        ),
      ),
    )
    .limit(1);

  if (jobById) {
    return jobById.id;
  }

  const parsedProject = parseProviderProjectId(canonicalProjectId);
  if (parsedProject) {
    return encodeProviderJobId({
      providerKind: parsedProject.providerKind,
      externalProjectId: parsedProject.externalProjectId,
      externalJobId: normalized,
    });
  }

  return normalized;
}

export async function resolveOrganizationJobId(
  organizationId: string,
  pathSegment: string,
): Promise<string> {
  const normalized = normalizePathSegment(pathSegment);
  const encodedJob = parseProviderJobId(normalized);
  if (encodedJob) {
    return normalized;
  }

  const [job] = await db
    .select({ id: schema.jobs.id, projectId: schema.jobs.projectId })
    .from(schema.jobs)
    .leftJoin(schema.externalJobDetails, eq(schema.externalJobDetails.jobId, schema.jobs.id))
    .where(
      and(
        eq(schema.jobs.organizationId, organizationId),
        or(
          eq(schema.jobs.id, normalized),
          eq(schema.externalJobDetails.externalJobId, normalized),
          eq(schema.externalJobDetails.externalTaskId, normalized),
        ),
      ),
    )
    .limit(1);

  if (job) {
    return job.id;
  }

  return normalized;
}
