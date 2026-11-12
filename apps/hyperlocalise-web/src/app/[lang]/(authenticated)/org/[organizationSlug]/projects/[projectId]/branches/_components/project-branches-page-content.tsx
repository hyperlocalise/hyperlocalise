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
import { GitBranchIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import type { ProjectBranchApiRecord } from "@/api/routes/project/project-branches.schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { TypographyP } from "@/components/ui/typography";
import { readApiResponseError } from "@/lib/api-error";
import { DEFAULT_PROJECT_BRANCH_NAME } from "@/lib/projects/branches/project-branch-name";
import { parseProviderProjectId } from "@/lib/providers/jobs/tms-provider-resource-id";

import { ProjectPageShell, ProjectSectionHeader } from "../../_components/project-page-shell";
import { projectBranchesPageContentMessages as messages } from "./project-branches-page-content.messages";

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

  const activeBranches = useMemo(
    () => (branchesQuery.data ?? []).filter((branch) => branch.status === "active"),
    [branchesQuery.data],
  );

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
    <ProjectPageShell>
      <ProjectSectionHeader icon={GitBranchIcon} section={intl.formatMessage(messages.title)} />
      <TypographyP size="small" tone="subtle">
        <FormattedMessage {...messages.description} />
      </TypographyP>

      {isProviderProject ? (
        <TypographyP size="small" tone="subtle">
          <FormattedMessage {...messages.providerUnavailable} />
        </TypographyP>
      ) : branchesQuery.isLoading ? (
        <div className="flex items-center gap-2">
          <Spinner />
        </div>
      ) : branchesQuery.isError ? (
        <TypographyP size="small" tone="subtle">
          {branchesQuery.error instanceof Error
            ? branchesQuery.error.message
            : intl.formatMessage(messages.loadFailed)}
        </TypographyP>
      ) : (
        <div className="grid gap-5">
          {canManage ? (
            <form
              className="grid gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-[1fr_1fr_12rem_auto] md:items-end"
              onSubmit={(event) => {
                event.preventDefault();
                createBranch.mutate();
              }}
            >
              <label className="grid gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  <FormattedMessage {...messages.nameLabel} />
                </span>
                <Input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                  maxLength={128}
                />
              </label>
              <label className="grid gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  <FormattedMessage {...messages.titleLabel} />
                </span>
                <Input value={title} onChange={(event) => setTitle(event.target.value)} />
              </label>
              <label className="grid gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  <FormattedMessage {...messages.baseLabel} />
                </span>
                <Select
                  value={baseBranchName}
                  onValueChange={(value) => {
                    if (value) {
                      setBaseBranchName(value);
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {activeBranches.map((branch) => (
                      <SelectItem key={branch.id} value={branch.name}>
                        {branch.title?.trim() || branch.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <Button type="submit" disabled={createBranch.isPending || name.trim().length === 0}>
                {createBranch.isPending ? <Spinner /> : null}
                <FormattedMessage {...messages.createAction} />
              </Button>
            </form>
          ) : null}

          {(branchesQuery.data ?? []).length === 0 ? (
            <TypographyP size="small" tone="subtle">
              <FormattedMessage {...messages.empty} />
            </TypographyP>
          ) : (
            <ul className="grid gap-3">
              {(branchesQuery.data ?? []).map((branch) => (
                <li
                  key={branch.id}
                  className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 md:flex-row md:items-center md:justify-between"
                >
                  <div className="grid gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{branch.title?.trim() || branch.name}</span>
                      {branch.title?.trim() ? (
                        <span className="text-sm text-muted-foreground">{branch.name}</span>
                      ) : null}
                      {branch.isDefault ? (
                        <Badge variant="outline">
                          <FormattedMessage {...messages.defaultBadge} />
                        </Badge>
                      ) : null}
                      {branch.isProtected ? (
                        <Badge variant="outline">
                          <FormattedMessage {...messages.protectedBadge} />
                        </Badge>
                      ) : null}
                      {branch.status === "merged" ? (
                        <Badge variant="outline">
                          <FormattedMessage {...messages.mergedBadge} />
                        </Badge>
                      ) : null}
                    </div>
                    <TypographyP size="xsmall" tone="subtle">
                      <FormattedMessage
                        {...messages.fileCount}
                        values={{ fileCount: branch.fileCount }}
                      />
                      {" · "}
                      <FormattedMessage
                        {...messages.keyCount}
                        values={{ keyCount: branch.keyCount }}
                      />
                    </TypographyP>
                  </div>
                  {canManage && branch.status === "active" ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="flex items-center gap-2 text-sm">
                        <Switch
                          checked={branch.isProtected}
                          onCheckedChange={(isProtected) =>
                            updateBranch.mutate({ name: branch.name, isProtected })
                          }
                        />
                        <FormattedMessage {...messages.protectLabel} />
                      </label>
                      {branch.isDefault ? null : (
                        <>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => syncBranch.mutate(branch.name)}
                            disabled={syncBranch.isPending}
                          >
                            <FormattedMessage {...messages.syncAction} />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setMergeStrategy("use_base");
                              setMergeBranch(branch);
                            }}
                          >
                            <FormattedMessage {...messages.mergeAction} />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => deleteBranch.mutate(branch.name)}
                            disabled={deleteBranch.isPending}
                          >
                            <FormattedMessage {...messages.deleteAction} />
                          </Button>
                        </>
                      )}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <Dialog open={Boolean(mergeBranch)} onOpenChange={(open) => !open && setMergeBranch(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              <FormattedMessage
                {...messages.mergeTitle}
                values={{ name: mergeBranch?.name ?? "" }}
              />
            </DialogTitle>
          </DialogHeader>
          {mergePreviewQuery.isLoading ? (
            <Spinner />
          ) : (
            <TypographyP size="small">
              <FormattedMessage {...messages.mergeAdded} values={previewCounts} />
              {" · "}
              <FormattedMessage {...messages.mergeChanged} values={previewCounts} />
              {" · "}
              <FormattedMessage {...messages.mergeConflicted} values={previewCounts} />
            </TypographyP>
          )}
          <Select
            value={mergeStrategy}
            onValueChange={(value) => setMergeStrategy(value as "use_branch" | "use_base")}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="use_base">
                <FormattedMessage {...messages.mergeUseBase} />
              </SelectItem>
              <SelectItem value="use_branch">
                <FormattedMessage {...messages.mergeUseBranch} />
              </SelectItem>
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setMergeBranch(null)}>
              <FormattedMessage {...messages.cancel} />
            </Button>
            <Button
              type="button"
              onClick={() => mergeBranchMutation.mutate()}
              disabled={mergeBranchMutation.isPending || mergePreviewQuery.isLoading}
            >
              <FormattedMessage {...messages.confirmMerge} />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ProjectPageShell>
  );
}
