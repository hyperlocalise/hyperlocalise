"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
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
