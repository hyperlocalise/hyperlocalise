import { normalizeProjectId } from "@/lib/projects/identity/project-id";
import {
  parseProviderJobId,
  parseProviderProjectId,
} from "@/lib/providers/tms-provider-resource-id";

export type ProjectPathInput = {
  id: string;
  source?: "native" | "external_tms" | null;
  externalProjectId?: string | null;
};

export type JobPathInput = {
  id: string;
  externalProviderKind?: string | null;
  externalJobId?: string | null;
};

export function formatProjectPathSegment(project: ProjectPathInput): string {
  if (project.source === "external_tms" && project.externalProjectId) {
    return project.externalProjectId;
  }

  const parsed = parseProviderProjectId(project.id);
  if (parsed) {
    return parsed.externalProjectId;
  }

  return project.id;
}

export function formatJobPathSegment(job: JobPathInput): string {
  if (job.externalProviderKind && job.externalJobId) {
    return job.externalJobId;
  }

  const parsed = parseProviderJobId(job.id);
  if (parsed) {
    return parsed.externalJobId;
  }

  return job.id;
}

export function buildOrgProjectHref(
  organizationSlug: string,
  projectSegment: string,
  ...pathParts: string[]
) {
  const base = `/org/${organizationSlug}/projects/${encodeURIComponent(projectSegment)}`;
  if (pathParts.length === 0) {
    return base;
  }

  return `${base}/${pathParts.map((part) => encodeURIComponent(part)).join("/")}`;
}

export function buildOrgJobHref(
  organizationSlug: string,
  projectSegment: string,
  jobSegment: string,
  ...pathParts: string[]
) {
  return buildOrgProjectHref(organizationSlug, projectSegment, "jobs", jobSegment, ...pathParts);
}

export function buildProjectDetailHref(
  organizationSlug: string,
  project: ProjectPathInput,
  section?: string,
) {
  const projectSegment = formatProjectPathSegment(project);
  return section
    ? buildOrgProjectHref(organizationSlug, projectSegment, section)
    : buildOrgProjectHref(organizationSlug, projectSegment);
}

export function buildJobDetailHrefFromRecords(
  organizationSlug: string,
  project: ProjectPathInput | null | undefined,
  job: JobPathInput,
) {
  if (!project?.id) {
    return null;
  }

  return buildOrgJobHref(
    organizationSlug,
    formatProjectPathSegment(project),
    formatJobPathSegment(job),
  );
}

export function isEncodedProviderPathSegment(value: string) {
  const normalized = normalizeProjectId(value);
  return typeof normalized === "string" && normalized.startsWith("ext:");
}
