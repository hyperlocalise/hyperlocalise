"use client";

import { useQuery } from "@tanstack/react-query";

import { readApiResponseError } from "@/lib/api-error";

import {
  ProjectFilesBranchFilterView,
  type ProviderProjectBranchOption,
} from "./project-files-branch-filter-view";

function providerBranchesApiPath(organizationSlug: string, projectId: string) {
  return `/api/orgs/${encodeURIComponent(organizationSlug)}/projects/${encodeURIComponent(projectId)}/files/branches`;
}

export function projectProviderBranchesQueryKey(organizationSlug: string, projectId: string) {
  return ["project-provider-branches", organizationSlug, projectId] as const;
}

async function fetchProviderProjectBranches(organizationSlug: string, projectId: string) {
  const response = await fetch(providerBranchesApiPath(organizationSlug, projectId), {
    method: "GET",
  });

  if (!response.ok) {
    throw await readApiResponseError(response, "Failed to load provider branches");
  }

  const body = (await response.json()) as {
    branches: ProviderProjectBranchOption[];
  };
  return body.branches;
}

export function ProjectFilesBranchFilter({
  organizationSlug,
  projectId,
  selectedBranch,
  onSelectedBranchChange,
}: {
  organizationSlug: string;
  projectId: string;
  selectedBranch: string | null;
  onSelectedBranchChange: (branch: string | null) => void;
}) {
  const branchesQuery = useQuery({
    queryKey: projectProviderBranchesQueryKey(organizationSlug, projectId),
    queryFn: () => fetchProviderProjectBranches(organizationSlug, projectId),
  });

  return (
    <ProjectFilesBranchFilterView
      branches={branchesQuery.data ?? []}
      selectedBranch={selectedBranch}
      onSelectedBranchChange={onSelectedBranchChange}
      isLoading={branchesQuery.isLoading}
    />
  );
}
