import {
  parseProviderJobId,
  parseProviderProjectId,
} from "@/lib/providers/tms-provider-resource-id";

export type WorkspaceProjectSource = "native" | "external_tms";

export type ProjectWorkspaceCapabilities = {
  source: WorkspaceProjectSource;
  isProviderProject: boolean;
  canUploadFiles: boolean;
  canEditProjectSettings: boolean;
  canDeleteProject: boolean;
  canSyncProviderJobs: boolean;
};

export function getProjectWorkspaceCapabilities(input: {
  projectId: string;
  source?: WorkspaceProjectSource;
}): ProjectWorkspaceCapabilities {
  const isProviderProject = Boolean(parseProviderProjectId(input.projectId));
  const source = input.source ?? (isProviderProject ? "external_tms" : "native");

  return {
    source,
    isProviderProject,
    canUploadFiles: !isProviderProject && source === "native",
    canEditProjectSettings: source === "native",
    canDeleteProject: source === "native",
    canSyncProviderJobs: isProviderProject || source === "external_tms",
  };
}

export function canOpenProviderJobCat(job: {
  id: string;
  kind: "translation" | "research" | "review" | "sync" | "asset_management";
  externalProviderKind: string | null;
}) {
  if (job.kind !== "translation" && job.kind !== "review") {
    return false;
  }

  return Boolean(job.externalProviderKind || parseProviderJobId(job.id));
}
