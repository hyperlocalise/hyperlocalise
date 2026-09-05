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
import { type FormEvent, useEffect, useState } from "react";
import { OrgNavLink } from "@/components/app-shell/org-nav-link";
import {
  Add01Icon,
  ArrowLeft01Icon,
  MoreHorizontalCircle01Icon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormattedMessage, useIntl } from "react-intl";

import type { TeamRole } from "@/api/routes/team/team.schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TypographyP } from "@/components/ui/typography";
import { cn } from "@/lib/primitives/cn";

import { WorkspacePeopleNav } from "../../_components/workspace-people-nav";
import { PageHeader, WorkspacePageShell } from "../../_components/workspace-resource-shared";

import { AddTeamMemberDialog } from "./add-team-member-dialog";
import { TeamDialog } from "./team-dialog";
import type { OrganizationMemberDirectoryEntry, TeamDetail, TeamMemberRow } from "./teams-api";
import { createTeamFormFromSummary } from "./team-form";
import {
  canRemoveTeamMember,
  canUpdateTeamMemberRole,
  getTeamRoleDescription,
  getTeamRoleLabel,
  listAssignableMembers,
  resolveTeamDetailPageState,
} from "./teams-settings-view-model";
import { teamDetailPageViewMessages } from "./team-detail-page-view.messages";

function MembersTableHeader({ showActions }: { showActions: boolean }) {
  return (
    <div
      role="row"
      className={cn(
        "hidden gap-4 border-b border-border px-1 py-2.5 text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase md:grid",
        showActions
          ? "md:grid-cols-[minmax(0,1.5fr)_12rem_2.5rem]"
          : "md:grid-cols-[minmax(0,1.5fr)_12rem]",
      )}
    >
      <div role="columnheader">
        <FormattedMessage {...teamDetailPageViewMessages.columnMember} />
      </div>
      <div role="columnheader">
        <FormattedMessage {...teamDetailPageViewMessages.columnRole} />
      </div>
      {showActions ? (
        <div role="columnheader" className="text-right">
          <span className="sr-only">
            <FormattedMessage {...teamDetailPageViewMessages.columnActions} />
          </span>
        </div>
      ) : null}
    </div>
  );
}

const teamRoles: TeamRole[] = ["manager", "member"];

function MemberRowActions({
  member,
  canUpdateRole,
  canRemove,
  isBusy,
  onChangeRole,
  onRemoveMember,
}: {
  member: TeamMemberRow;
  canUpdateRole: boolean;
  canRemove: boolean;
  isBusy: boolean;
  onChangeRole: (member: TeamMemberRow) => void;
  onRemoveMember: (member: TeamMemberRow) => void;
}) {
  const intl = useIntl();

  if (!canUpdateRole && !canRemove) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className={cn(
              "rounded-full text-muted-foreground hover:bg-accent/20 hover:text-foreground",
              "opacity-100 transition-opacity md:opacity-0 md:group-hover/row:opacity-100 md:group-focus-within/row:opacity-100",
              "data-popup-open:opacity-100 aria-expanded:opacity-100",
            )}
            aria-label={intl.formatMessage(teamDetailPageViewMessages.actionsForMember, {
              email: member.email,
            })}
            disabled={isBusy}
          />
        }
      >
        <HugeiconsIcon icon={MoreHorizontalCircle01Icon} strokeWidth={1.8} className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        {canUpdateRole ? (
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => onChangeRole(member)} disabled={isBusy}>
              <FormattedMessage {...teamDetailPageViewMessages.changeRole} />
            </DropdownMenuItem>
          </DropdownMenuGroup>
        ) : null}
        {canUpdateRole && canRemove ? <DropdownMenuSeparator /> : null}
        {canRemove ? (
          <DropdownMenuGroup>
            <DropdownMenuItem
              variant="destructive"
              onClick={() => onRemoveMember(member)}
              disabled={isBusy}
            >
              <FormattedMessage {...teamDetailPageViewMessages.removeFromTeam} />
            </DropdownMenuItem>
          </DropdownMenuGroup>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ChangeTeamMemberRoleDialog({
  member,
  isSaving,
  onOpenChange,
  onSubmit,
}: {
  member: TeamMemberRow | null;
  isSaving: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: { workosUserId: string; role: TeamRole }) => void;
}) {
  const intl = useIntl();
  const [role, setRole] = useState<TeamRole>(member?.role ?? "member");

  useEffect(() => {
    if (member) {
      setRole(member.role);
    }
  }, [member]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!member || role === member.role) {
      return;
    }

    onSubmit({ workosUserId: member.workosUserId, role });
  }

  return (
    <Dialog
      open={member !== null}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && isSaving) {
          return;
        }

        onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="border-border bg-background text-foreground sm:max-w-md">
        <form onSubmit={handleSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>
              <FormattedMessage {...teamDetailPageViewMessages.changeRoleTitle} />
            </DialogTitle>
            <DialogDescription>
              {member
                ? intl.formatMessage(teamDetailPageViewMessages.changeRoleDescription, {
                    email: member.email,
                  })
                : ""}
            </DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel>
              <FormattedMessage {...teamDetailPageViewMessages.roleLabel} />
            </FieldLabel>
            <Select
              value={role}
              onValueChange={(value) => setRole(value as TeamRole)}
              disabled={isSaving}
            >
              <SelectTrigger className="border-border bg-muted">
                <SelectValue>{getTeamRoleLabel(role, intl)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {teamRoles.map((teamRole) => (
                  <SelectItem
                    key={teamRole}
                    value={teamRole}
                    label={getTeamRoleLabel(teamRole, intl)}
                  >
                    {getTeamRoleLabel(teamRole, intl)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription>{getTeamRoleDescription(role, intl)}</FieldDescription>
          </Field>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isSaving}
              onClick={() => onOpenChange(false)}
            >
              <FormattedMessage {...teamDetailPageViewMessages.cancel} />
            </Button>
            <Button type="submit" disabled={isSaving || !member || role === member.role}>
              {isSaving ? <Spinner /> : null}
              {isSaving ? (
                <FormattedMessage {...teamDetailPageViewMessages.updatingRole} />
              ) : (
                <FormattedMessage {...teamDetailPageViewMessages.updateRole} />
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function TeamDetailPageView({
  organizationSlug,
  team,
  canManageTeams,
  currentUserWorkosId,
  memberDirectory,
  isLoading,
  error,
  isAddMemberOpen,
  isAddingMember,
  isEditOpen,
  isSavingTeam,
  isRemovingMember,
  isUpdatingMemberRole,
  editingMember,
  removingMember,
  onAddMemberOpenChange,
  onEditOpenChange,
  onAddMember,
  onUpdateTeam,
  onUpdateMemberRole,
  onEditingMemberChange,
  onRemoveMember,
  onRemovingMemberChange,
}: {
  organizationSlug: string;
  team: TeamDetail | undefined;
  canManageTeams: boolean;
  currentUserWorkosId: string;
  memberDirectory: OrganizationMemberDirectoryEntry[];
  isLoading: boolean;
  error?: unknown;
  isAddMemberOpen: boolean;
  isAddingMember: boolean;
  isEditOpen: boolean;
  isSavingTeam: boolean;
  isRemovingMember: boolean;
  isUpdatingMemberRole: boolean;
  editingMember: TeamMemberRow | null;
  removingMember: TeamMemberRow | null;
  onAddMemberOpenChange: (open: boolean) => void;
  onEditOpenChange: (open: boolean) => void;
  onAddMember: (input: { workosUserId: string; role: TeamRole }) => void;
  onUpdateTeam: (values: { name: string; slug: string }) => void;
  onUpdateMemberRole: (input: { workosUserId: string; role: TeamRole }) => void;
  onEditingMemberChange: (member: TeamMemberRow | null) => void;
  onRemoveMember: (workosUserId: string) => void;
  onRemovingMemberChange: (member: TeamMemberRow | null) => void;
}) {
  const intl = useIntl();
  const pageState = resolveTeamDetailPageState({
    team,
    canManageTeams,
    currentUserWorkosId,
  });
  const assignableMembers = listAssignableMembers({
    directory: memberDirectory,
    members: pageState.members,
  });

  return (
    <WorkspacePageShell>
      <WorkspacePeopleNav organizationSlug={organizationSlug} />

      <div className="flex flex-col gap-4">
        <Button
          nativeButton={false}
          render={<OrgNavLink href={`/org/${organizationSlug}/teams`} />}
          variant="ghost"
          size="sm"
          className="w-fit px-2 text-muted-foreground hover:text-foreground"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={1.8} />
          <FormattedMessage {...teamDetailPageViewMessages.backToTeams} />
        </Button>

        <PageHeader
          icon={UserGroupIcon}
          label={intl.formatMessage(teamDetailPageViewMessages.pageLabel)}
          title={team?.name ?? intl.formatMessage(teamDetailPageViewMessages.pageTitleFallback)}
          description={
            team
              ? intl.formatMessage(teamDetailPageViewMessages.pageDescriptionWithSlug, {
                  slug: team.slug,
                })
              : intl.formatMessage(teamDetailPageViewMessages.pageDescriptionLoading)
          }
          actions={
            pageState.canManageTeams && team ? (
              <Button
                type="button"
                variant="outline"
                className="w-full sm:w-fit"
                onClick={() => onEditOpenChange(true)}
                disabled={isSavingTeam}
              >
                <FormattedMessage {...teamDetailPageViewMessages.editTeam} />
              </Button>
            ) : null
          }
        />
      </div>

      <section
        aria-label={intl.formatMessage(teamDetailPageViewMessages.sectionLabel)}
        className="min-w-0"
      >
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <TypographyP size="small" weight="medium" tone="content">
              <FormattedMessage {...teamDetailPageViewMessages.membersHeading} />
            </TypographyP>
            <TypographyP className="mt-1" size="small" tone="subtle">
              <FormattedMessage
                {...teamDetailPageViewMessages.membersDescription}
                values={{
                  invite: (chunks) => (
                    <OrgNavLink
                      href={`/org/${organizationSlug}/members`}
                      className="font-medium text-subtle-foreground underline-offset-4 hover:text-foreground hover:underline"
                    >
                      {chunks}
                    </OrgNavLink>
                  ),
                }}
              />
            </TypographyP>
          </div>
          {pageState.canManageMembers ? (
            <Button
              type="button"
              onClick={() => onAddMemberOpenChange(true)}
              className="w-full sm:w-fit"
              disabled={isAddingMember}
            >
              <HugeiconsIcon icon={Add01Icon} strokeWidth={1.8} />
              <FormattedMessage {...teamDetailPageViewMessages.addMember} />
            </Button>
          ) : null}
        </div>

        {isLoading ? (
          <TypographyP className="py-8" size="small" tone="subtle">
            <FormattedMessage {...teamDetailPageViewMessages.loading} />
          </TypographyP>
        ) : error ? (
          <div className="py-8">
            <TypographyP className="text-flame-100" size="small" weight="medium">
              <FormattedMessage {...teamDetailPageViewMessages.loadFailed} />
            </TypographyP>
            <TypographyP className="mt-1" size="xsmall" tone="subtle">
              {error instanceof Error
                ? error.message
                : intl.formatMessage(teamDetailPageViewMessages.loadFailedFallback)}
            </TypographyP>
          </div>
        ) : pageState.members.length === 0 ? (
          <div className="py-10">
            <TypographyP size="small" weight="medium" tone="content">
              <FormattedMessage {...teamDetailPageViewMessages.emptyTitle} />
            </TypographyP>
            <TypographyP className="mt-2 max-w-xl leading-6" size="small" tone="subtle">
              <FormattedMessage {...teamDetailPageViewMessages.emptyDescription} />
            </TypographyP>
          </div>
        ) : (
          <div role="table" className="min-w-0">
            <MembersTableHeader showActions={pageState.canManageMembers} />
            {pageState.members.map((member) => {
              const isCurrentUser = member.workosUserId === currentUserWorkosId;
              const canUpdateRole = canUpdateTeamMemberRole({
                member,
                members: pageState.members,
                canManageMembers: pageState.canManageMembers,
              });
              const canRemove = canRemoveTeamMember({
                member,
                members: pageState.members,
                canManageMembers: pageState.canManageMembers,
              });

              return (
                <div
                  key={member.workosUserId}
                  role="row"
                  className={cn(
                    "group/row grid gap-4 border-t border-border px-1 py-3 transition-colors hover:bg-muted/40 md:items-center",
                    pageState.canManageMembers
                      ? "md:grid-cols-[minmax(0,1.5fr)_12rem_2.5rem]"
                      : "md:grid-cols-[minmax(0,1.5fr)_12rem]",
                  )}
                >
                  <div role="cell" className="min-w-0">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <TypographyP lineClamp={1} size="small" weight="medium" tone="content">
                        {member.email}
                      </TypographyP>
                      {isCurrentUser ? (
                        <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                          <FormattedMessage {...teamDetailPageViewMessages.youBadge} />
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div role="cell" className="min-w-0">
                    <div className="flex items-center justify-between gap-3 md:block">
                      <span className="text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase md:hidden">
                        <FormattedMessage {...teamDetailPageViewMessages.columnRole} />
                      </span>
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Badge
                              variant="outline"
                              className={cn(
                                "h-auto max-w-[12rem] truncate rounded-lg px-3 py-1.5 text-sm",
                                "border-border bg-muted text-subtle-foreground",
                              )}
                            >
                              {getTeamRoleLabel(member.role, intl)}
                            </Badge>
                          }
                        />
                        <TooltipContent side="bottom" align="start" className="max-w-xs">
                          {getTeamRoleDescription(member.role, intl)}
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </div>

                  <div role="cell" className="flex items-center justify-end">
                    {pageState.canManageMembers ? (
                      <MemberRowActions
                        member={member}
                        canUpdateRole={canUpdateRole}
                        canRemove={canRemove}
                        isBusy={isRemovingMember || isUpdatingMemberRole}
                        onChangeRole={onEditingMemberChange}
                        onRemoveMember={onRemovingMemberChange}
                      />
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {team ? (
        <TeamDialog
          open={isEditOpen}
          mode="edit"
          title={intl.formatMessage(teamDetailPageViewMessages.editTeamTitle)}
          description={intl.formatMessage(teamDetailPageViewMessages.editTeamDescription)}
          initialValues={createTeamFormFromSummary(team)}
          isSaving={isSavingTeam}
          onOpenChange={onEditOpenChange}
          onSubmit={onUpdateTeam}
        />
      ) : null}

      <AddTeamMemberDialog
        open={isAddMemberOpen}
        assignableMembers={assignableMembers}
        isSaving={isAddingMember}
        onOpenChange={onAddMemberOpenChange}
        onSubmit={onAddMember}
      />

      <ChangeTeamMemberRoleDialog
        member={editingMember}
        isSaving={isUpdatingMemberRole}
        onOpenChange={(open) => {
          if (!open) {
            onEditingMemberChange(null);
          }
        }}
        onSubmit={onUpdateMemberRole}
      />

      <Dialog
        open={removingMember !== null}
        onOpenChange={(open) => !open && onRemovingMemberChange(null)}
      >
        <DialogContent className="border-border bg-background text-foreground sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              <FormattedMessage {...teamDetailPageViewMessages.removeMemberTitle} />
            </DialogTitle>
            <DialogDescription>
              {removingMember
                ? intl.formatMessage(teamDetailPageViewMessages.removeMemberDescription, {
                    email: removingMember.email,
                  })
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onRemovingMemberChange(null)}>
              <FormattedMessage {...teamDetailPageViewMessages.cancel} />
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={!removingMember || isRemovingMember}
              onClick={() => {
                if (removingMember) {
                  onRemoveMember(removingMember.workosUserId);
                }
              }}
            >
              <FormattedMessage {...teamDetailPageViewMessages.removeMemberConfirm} />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </WorkspacePageShell>
  );
}
