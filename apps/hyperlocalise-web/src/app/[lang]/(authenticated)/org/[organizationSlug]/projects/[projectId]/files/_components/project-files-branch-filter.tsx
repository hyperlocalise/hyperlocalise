"use client";

import { useQuery } from "@tanstack/react-query";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TypographyP } from "@/components/ui/typography";
import { readApiResponseError } from "@/lib/api-error";

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
    branches: Array<{ name: string; title?: string | null }>;
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

  const branches = branchesQuery.data ?? [];
  if (branchesQuery.isLoading) {
    return (
      <TypographyP className="px-4 py-2 text-xs text-muted-foreground">
        Loading branches…
      </TypographyP>
    );
  }

  if (branchesQuery.isError || branches.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 border-b border-border px-4 py-2">
      <TypographyP className="shrink-0 text-xs text-muted-foreground">Branch</TypographyP>
      <Select
        value={selectedBranch ?? "__all__"}
        onValueChange={(value) => {
          onSelectedBranchChange(value === "__all__" ? null : value);
        }}
      >
        <SelectTrigger size="sm" className="h-8 min-w-40 max-w-full">
          <SelectValue placeholder="All branches" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">All branches</SelectItem>
          {branches.map((branch) => (
            <SelectItem key={branch.name} value={branch.name}>
              {branch.title?.trim() ? `${branch.title} (${branch.name})` : branch.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
