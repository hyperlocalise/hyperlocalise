"use client";

import Link from "next/link";
import {
  Add01Icon,
  ArrowLeft01Icon,
  MoreHorizontalCircle01Icon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
      <div role="columnheader">Member</div>
      <div role="columnheader">Role</div>
      {showActions ? (
        <div role="columnheader" className="text-right">
          <span className="sr-only">Actions</span>
        </div>
      ) : null}
    </div>
  );
}

function MemberRowActions({
  member,
  canRemove,
  isRemovingMember,
  onRemoveMember,
}: {
  member: TeamMemberRow;
  canRemove: boolean;
  isRemovingMember: boolean;
  onRemoveMember: (member: TeamMemberRow) => void;
}) {
  if (!canRemove) {
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
            aria-label={`Actions for ${member.email}`}
            disabled={isRemovingMember}
          />
        }
      >
        <HugeiconsIcon icon={MoreHorizontalCircle01Icon} strokeWidth={1.8} className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuGroup>
          <DropdownMenuItem
            variant="destructive"
            onClick={() => onRemoveMember(member)}
            disabled={isRemovingMember}
          >
            Remove from team...
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
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
  updatingMemberRoleId,
  removingMember,
  onAddMemberOpenChange,
  onEditOpenChange,
  onAddMember,
  onUpdateTeam,
  onUpdateMemberRole,
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
  updatingMemberRoleId: string | null;
  removingMember: TeamMemberRow | null;
  onAddMemberOpenChange: (open: boolean) => void;
  onEditOpenChange: (open: boolean) => void;
  onAddMember: (input: { workosUserId: string; role: TeamRole }) => void;
  onUpdateTeam: (values: { name: string; slug: string }) => void;
  onUpdateMemberRole: (input: { workosUserId: string; role: TeamRole }) => void;
  onRemoveMember: (workosUserId: string) => void;
  onRemovingMemberChange: (member: TeamMemberRow | null) => void;
}) {
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
          render={<Link href={`/org/${organizationSlug}/teams`} />}
          variant="ghost"
          size="sm"
          className="w-fit px-2 text-muted-foreground hover:text-foreground"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={1.8} />
          Back to teams
        </Button>

        <PageHeader
          icon={UserGroupIcon}
          label="Team"
          title={team?.name ?? "Team"}
          description={
            team
              ? `Manage membership and roles for the ${team.slug} team.`
              : "Load team membership and roles."
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
                Edit team
              </Button>
            ) : null
          }
        />
      </div>

      <section aria-label="Team members" className="min-w-0">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <TypographyP className="text-sm font-medium text-foreground">Members</TypographyP>
            <TypographyP className="mt-1 text-sm text-muted-foreground">
              People assigned to this team can access its projects and jobs. Need someone new in the
              workspace?{" "}
              <Link
                href={`/org/${organizationSlug}/members`}
                className="font-medium text-subtle-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                Invite a member
              </Link>
              .
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
              Add member
            </Button>
          ) : null}
        </div>

        {isLoading ? (
          <TypographyP className="py-8 text-sm text-muted-foreground">Loading team...</TypographyP>
        ) : error ? (
          <div className="py-8">
            <TypographyP className="text-sm font-medium text-flame-100">
              Team failed to load.
            </TypographyP>
            <TypographyP className="mt-1 text-xs text-muted-foreground">
              {error instanceof Error ? error.message : "Refresh the page to try again."}
            </TypographyP>
          </div>
        ) : pageState.members.length === 0 ? (
          <div className="py-10">
            <TypographyP className="text-sm font-medium text-foreground">
              No members on this team
            </TypographyP>
            <TypographyP className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
              Add workspace members to start scoping projects and jobs to this team.
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
                      <TypographyP className="truncate text-sm font-medium text-foreground">
                        {member.email}
                      </TypographyP>
                      {isCurrentUser ? (
                        <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                          You
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div role="cell" className="min-w-0">
                    <div className="flex items-center justify-between gap-3 md:block">
                      <span className="text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase md:hidden">
                        Role
                      </span>
                      {canUpdateRole ? (
                        <Select
                          value={member.role}
                          onValueChange={(value) => {
                            if (value === member.role) {
                              return;
                            }

                            onUpdateMemberRole({
                              workosUserId: member.workosUserId,
                              role: value as TeamRole,
                            });
                          }}
                          disabled={updatingMemberRoleId === member.workosUserId}
                        >
                          <SelectTrigger className="h-9 w-[12rem] max-w-full border-border bg-background/60 text-subtle-foreground hover:bg-muted">
                            <SelectValue>{getTeamRoleLabel(member.role)}</SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="manager">{getTeamRoleLabel("manager")}</SelectItem>
                            <SelectItem value="member">{getTeamRoleLabel("member")}</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
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
                                {getTeamRoleLabel(member.role)}
                              </Badge>
                            }
                          />
                          <TooltipContent side="bottom" align="start" className="max-w-xs">
                            {getTeamRoleDescription(member.role)}
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </div>

                  <div role="cell" className="flex items-center justify-end">
                    {pageState.canManageMembers ? (
                      <MemberRowActions
                        member={member}
                        canRemove={canRemove}
                        isRemovingMember={isRemovingMember}
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
          title="Edit team"
          description="Update the team name or slug used for project scoping."
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

      <Dialog
        open={removingMember !== null}
        onOpenChange={(open) => !open && onRemovingMemberChange(null)}
      >
        <DialogContent className="border-border bg-background text-foreground sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remove team member</DialogTitle>
            <DialogDescription>
              {removingMember
                ? `${removingMember.email} will lose access to projects scoped to this team.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onRemovingMemberChange(null)}>
              Cancel
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
              Remove member
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </WorkspacePageShell>
  );
}
