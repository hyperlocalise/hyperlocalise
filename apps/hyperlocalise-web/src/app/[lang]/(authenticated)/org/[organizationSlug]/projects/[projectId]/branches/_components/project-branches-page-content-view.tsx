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
import { GitBranchIcon } from "@phosphor-icons/react";
import { FormattedMessage, useIntl } from "react-intl";

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

import { ProjectPageShell, ProjectSectionHeader } from "../../_components/project-page-shell";
import { projectBranchesPageContentMessages as messages } from "./project-branches-page-content.messages";

export type ProjectBranchMergePreviewCounts = {
  added: number;
  changed: number;
  conflicted: number;
};

export function ProjectBranchesPageContentView({
  canManage,
  isProviderProject,
  isLoading,
  isError,
  errorMessage,
  branches,
  name,
  title,
  baseBranchName,
  onNameChange,
  onTitleChange,
  onBaseBranchNameChange,
  onCreate,
  isCreating,
  onProtectChange,
  onSync,
  isSyncing,
  onDelete,
  isDeleting,
  mergeBranch,
  mergeStrategy,
  onMergeStrategyChange,
  onOpenMerge,
  onCloseMerge,
  onConfirmMerge,
  isMerging,
  isMergePreviewLoading,
  previewCounts,
}: {
  canManage: boolean;
  isProviderProject: boolean;
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string;
  branches: ProjectBranchApiRecord[];
  name: string;
  title: string;
  baseBranchName: string;
  onNameChange: (value: string) => void;
  onTitleChange: (value: string) => void;
  onBaseBranchNameChange: (value: string) => void;
  onCreate: () => void;
  isCreating: boolean;
  onProtectChange: (input: { name: string; isProtected: boolean }) => void;
  onSync: (branchName: string) => void;
  isSyncing: boolean;
  onDelete: (branchName: string) => void;
  isDeleting: boolean;
  mergeBranch: ProjectBranchApiRecord | null;
  mergeStrategy: "use_branch" | "use_base";
  onMergeStrategyChange: (value: "use_branch" | "use_base") => void;
  onOpenMerge: (branch: ProjectBranchApiRecord) => void;
  onCloseMerge: () => void;
  onConfirmMerge: () => void;
  isMerging: boolean;
  isMergePreviewLoading: boolean;
  previewCounts: ProjectBranchMergePreviewCounts;
}) {
  const intl = useIntl();
  const activeBranches = branches.filter((branch) => branch.status === "active");

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
      ) : isLoading ? (
        <div className="flex items-center gap-2">
          <Spinner />
        </div>
      ) : isError ? (
        <TypographyP size="small" tone="subtle">
          {errorMessage ?? intl.formatMessage(messages.loadFailed)}
        </TypographyP>
      ) : (
        <div className="grid gap-5">
          {canManage ? (
            <form
              className="grid gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-[1fr_1fr_12rem_auto] md:items-end"
              onSubmit={(event) => {
                event.preventDefault();
                onCreate();
              }}
            >
              <label className="grid gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  <FormattedMessage {...messages.nameLabel} />
                </span>
                <Input
                  value={name}
                  onChange={(event) => onNameChange(event.target.value)}
                  required
                  maxLength={128}
                />
              </label>
              <label className="grid gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  <FormattedMessage {...messages.titleLabel} />
                </span>
                <Input value={title} onChange={(event) => onTitleChange(event.target.value)} />
              </label>
              <label className="grid gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  <FormattedMessage {...messages.baseLabel} />
                </span>
                <Select
                  value={baseBranchName}
                  onValueChange={(value) => {
                    if (value) {
                      onBaseBranchNameChange(value);
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
              <Button type="submit" disabled={isCreating || name.trim().length === 0}>
                {isCreating ? <Spinner /> : null}
                <FormattedMessage {...messages.createAction} />
              </Button>
            </form>
          ) : null}

          {branches.length === 0 ? (
            <TypographyP size="small" tone="subtle">
              <FormattedMessage {...messages.empty} />
            </TypographyP>
          ) : (
            <ul className="grid gap-3">
              {branches.map((branch) => (
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
                            onProtectChange({ name: branch.name, isProtected })
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
                            onClick={() => onSync(branch.name)}
                            disabled={isSyncing}
                          >
                            <FormattedMessage {...messages.syncAction} />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => onOpenMerge(branch)}
                          >
                            <FormattedMessage {...messages.mergeAction} />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => onDelete(branch.name)}
                            disabled={isDeleting}
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

      <Dialog open={Boolean(mergeBranch)} onOpenChange={(open) => !open && onCloseMerge()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              <FormattedMessage
                {...messages.mergeTitle}
                values={{ name: mergeBranch?.name ?? "" }}
              />
            </DialogTitle>
          </DialogHeader>
          {isMergePreviewLoading ? (
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
            onValueChange={(value) => {
              if (value === "use_branch" || value === "use_base") {
                onMergeStrategyChange(value);
              }
            }}
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
            <Button type="button" variant="outline" onClick={onCloseMerge}>
              <FormattedMessage {...messages.cancel} />
            </Button>
            <Button
              type="button"
              onClick={onConfirmMerge}
              disabled={isMerging || isMergePreviewLoading}
            >
              <FormattedMessage {...messages.confirmMerge} />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ProjectPageShell>
  );
}
