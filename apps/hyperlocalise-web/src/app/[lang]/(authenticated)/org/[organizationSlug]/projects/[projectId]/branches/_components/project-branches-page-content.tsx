"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useIntl } from "react-intl";
import { toast } from "sonner";

import type { ProjectBranchApiRecord } from "@/api/routes/project/project-branches.schema";
import { readApiResponseError } from "@/lib/api-error";
import { DEFAULT_PROJECT_BRANCH_NAME } from "@/lib/projects/branches/project-branch-name";
import { parseProviderProjectId } from "@/lib/providers/jobs/tms-provider-resource-id";

import { projectBranchesPageContentMessages as messages } from "./project-branches-page-content.messages";
import { ProjectBranchesPageContentView } from "./project-branches-page-content-view";

function branchesApiPath(organizationSlug: string, projectId: string, branchName?: string) {
  const base = `/api/orgs/${encodeURIComponent(organizationSlug)}/projects/${encodeURIComponent(projectId)}/branches`;
  return branchName ? `${base}/${encodeURIComponent(branchName)}` : base;
}

function projectBranchesQueryKey(organizationSlug: string, projectId: string) {
  return ["project-branches", organizationSlug, projectId] as const;
}

async function readJson<T>(response: Response, fallback: string): Promise<T> {
  if (!response.ok) {
    throw await readApiResponseError(response, fallback);
  }
  return (await response.json()) as T;
}

export function ProjectBranchesPageContent({
  organizationSlug,
  projectId,
  canManage,
}: {
  organizationSlug: string;
  projectId: string;
  canManage: boolean;
}) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const isProviderProject = Boolean(parseProviderProjectId(projectId));
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [baseBranchName, setBaseBranchName] = useState(DEFAULT_PROJECT_BRANCH_NAME);
  const [mergeBranch, setMergeBranch] = useState<ProjectBranchApiRecord | null>(null);
  const [mergeStrategy, setMergeStrategy] = useState<"use_branch" | "use_base">("use_base");

  const branchesQuery = useQuery({
    queryKey: projectBranchesQueryKey(organizationSlug, projectId),
    enabled: !isProviderProject,
    queryFn: async () => {
      const response = await fetch(branchesApiPath(organizationSlug, projectId));
      const body = await readJson<{ branches: ProjectBranchApiRecord[] }>(
        response,
        intl.formatMessage(messages.loadFailed),
      );
      return body.branches;
    },
  });

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: projectBranchesQueryKey(organizationSlug, projectId),
    });

  const createBranch = useMutation({
    mutationFn: async () => {
      const response = await fetch(branchesApiPath(organizationSlug, projectId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          title: title.trim() || null,
          baseBranchName,
        }),
      });
      return readJson<{ branch: ProjectBranchApiRecord }>(
        response,
        intl.formatMessage(messages.loadFailed),
      );
    },
    onSuccess: async (body) => {
      setName("");
      setTitle("");
      await invalidate();
      toast.success(intl.formatMessage(messages.createSuccess, { name: body.branch.name }));
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : intl.formatMessage(messages.loadFailed));
    },
  });

  const updateBranch = useMutation({
    mutationFn: async (input: { name: string; isProtected: boolean }) => {
      const response = await fetch(branchesApiPath(organizationSlug, projectId, input.name), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isProtected: input.isProtected }),
      });
      return readJson<{ branch: ProjectBranchApiRecord }>(
        response,
        intl.formatMessage(messages.loadFailed),
      );
    },
    onSuccess: invalidate,
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : intl.formatMessage(messages.loadFailed));
    },
  });

  const syncBranch = useMutation({
    mutationFn: async (branchName: string) => {
      const response = await fetch(
        `${branchesApiPath(organizationSlug, projectId, branchName)}/sync`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ strategy: "use_base" }),
        },
      );
      return readJson<{ branch: ProjectBranchApiRecord }>(
        response,
        intl.formatMessage(messages.loadFailed),
      );
    },
    onSuccess: async (body) => {
      await invalidate();
      toast.success(intl.formatMessage(messages.syncSuccess, { name: body.branch.name }));
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : intl.formatMessage(messages.loadFailed));
    },
  });

  const deleteBranch = useMutation({
    mutationFn: async (branchName: string) => {
      const response = await fetch(branchesApiPath(organizationSlug, projectId, branchName), {
        method: "DELETE",
      });
      if (!response.ok) {
        throw await readApiResponseError(response, intl.formatMessage(messages.loadFailed));
      }
      return branchName;
    },
    onSuccess: async (branchName) => {
      await invalidate();
      toast.success(intl.formatMessage(messages.deleteSuccess, { name: branchName }));
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : intl.formatMessage(messages.loadFailed));
    },
  });

  const mergePreviewQuery = useQuery({
    queryKey: [
      "project-branch-merge-preview",
      organizationSlug,
      projectId,
      mergeBranch?.name ?? "",
    ],
    enabled: Boolean(mergeBranch),
    queryFn: async () => {
      const response = await fetch(
        `${branchesApiPath(organizationSlug, projectId, mergeBranch!.name)}/merge`,
      );
      return readJson<{
        changes: Array<{ kind: "added" | "changed" | "conflicted" }>;
      }>(response, intl.formatMessage(messages.loadFailed));
    },
  });

  const mergeBranchMutation = useMutation({
    mutationFn: async () => {
      if (!mergeBranch) {
        throw new Error(intl.formatMessage(messages.loadFailed));
      }
      const response = await fetch(
        `${branchesApiPath(organizationSlug, projectId, mergeBranch.name)}/merge`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ strategy: mergeStrategy }),
        },
      );
      return readJson<{ branch: ProjectBranchApiRecord }>(
        response,
        intl.formatMessage(messages.loadFailed),
      );
    },
    onSuccess: async () => {
      const mergedName = mergeBranch?.name ?? "";
      setMergeBranch(null);
      await invalidate();
      toast.success(intl.formatMessage(messages.mergeSuccess, { name: mergedName }));
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : intl.formatMessage(messages.loadFailed));
    },
  });

  const previewCounts = useMemo(() => {
    const changes = mergePreviewQuery.data?.changes ?? [];
    return {
      added: changes.filter((change) => change.kind === "added").length,
      changed: changes.filter((change) => change.kind === "changed").length,
      conflicted: changes.filter((change) => change.kind === "conflicted").length,
    };
  }, [mergePreviewQuery.data]);

  return (
    <ProjectBranchesPageContentView
      canManage={canManage}
      isProviderProject={isProviderProject}
      isLoading={branchesQuery.isLoading}
      isError={branchesQuery.isError}
      errorMessage={
        branchesQuery.error instanceof Error
          ? branchesQuery.error.message
          : branchesQuery.isError
            ? intl.formatMessage(messages.loadFailed)
            : undefined
      }
      branches={branchesQuery.data ?? []}
      name={name}
      title={title}
      baseBranchName={baseBranchName}
      onNameChange={setName}
      onTitleChange={setTitle}
      onBaseBranchNameChange={setBaseBranchName}
      onCreate={() => createBranch.mutate()}
      isCreating={createBranch.isPending}
      onProtectChange={(input) => updateBranch.mutate(input)}
      onSync={(branchName) => syncBranch.mutate(branchName)}
      isSyncing={syncBranch.isPending}
      onDelete={(branchName) => deleteBranch.mutate(branchName)}
      isDeleting={deleteBranch.isPending}
      mergeBranch={mergeBranch}
      mergeStrategy={mergeStrategy}
      onMergeStrategyChange={setMergeStrategy}
      onOpenMerge={(branch) => {
        setMergeStrategy("use_base");
        setMergeBranch(branch);
      }}
      onCloseMerge={() => setMergeBranch(null)}
      onConfirmMerge={() => mergeBranchMutation.mutate()}
      isMerging={mergeBranchMutation.isPending}
      isMergePreviewLoading={mergePreviewQuery.isLoading}
      previewCounts={previewCounts}
    />
  );
}
