"use client";

import Link from "next/link";
import {
  Add01Icon,
  ArrowLeft01Icon,
  Delete01Icon,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TypographyP } from "@/components/ui/typography";
import { cn } from "@/lib/primitives/cn";

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

function MembersTableHeader() {
  return (
    <div
      role="row"
      className="hidden grid-cols-[minmax(0,1.5fr)_12rem_2.5rem] gap-4 border-b border-foreground/8 px-1 py-2.5 text-xs font-medium tracking-[0.08em] text-foreground/36 uppercase md:grid"
    >
      <div role="columnheader">Member</div>
      <div role="columnheader">Role</div>
      <div role="columnheader" className="text-right">
        Actions
      </div>
    </div>
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
      <div className="flex flex-col gap-4">
        <Button
          nativeButton={false}
          render={<Link href={`/org/${organizationSlug}/teams`} />}
          variant="ghost"
          size="sm"
          className="w-fit px-2 text-foreground/56 hover:text-foreground"
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
            <TypographyP className="mt-1 text-sm text-foreground/52">
              People assigned to this team can access its projects and jobs.
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
          <TypographyP className="py-8 text-sm text-foreground/52">Loading team...</TypographyP>
        ) : error ? (
          <div className="py-8">
            <TypographyP className="text-sm font-medium text-flame-100">
              Team failed to load.
            </TypographyP>
            <TypographyP className="mt-1 text-xs text-foreground/48">
              {error instanceof Error ? error.message : "Refresh the page to try again."}
            </TypographyP>
          </div>
        ) : pageState.members.length === 0 ? (
          <div className="py-10">
            <TypographyP className="text-sm font-medium text-foreground">
              No members on this team
            </TypographyP>
            <TypographyP className="mt-2 max-w-xl text-sm leading-6 text-foreground/52">
              Add workspace members to start scoping projects and jobs to this team.
            </TypographyP>
          </div>
        ) : (
          <div role="table" className="min-w-0">
            <MembersTableHeader />
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
                  className="grid gap-4 border-t border-foreground/8 px-1 py-4 md:grid-cols-[minmax(0,1.5fr)_12rem_2.5rem] md:items-center"
                >
                  <div role="cell" className="min-w-0">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <TypographyP className="truncate text-sm font-medium text-foreground">
                        {member.email}
                      </TypographyP>
                      {isCurrentUser ? (
                        <span className="rounded-full border border-foreground/10 bg-foreground/4 px-2 py-0.5 text-xs font-medium text-foreground/58">
                          You
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div role="cell" className="min-w-0">
                    <div className="flex items-center justify-between gap-3 md:block">
                      <span className="text-xs font-medium tracking-[0.08em] text-foreground/34 uppercase md:hidden">
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
                          <SelectTrigger className="h-9 w-[12rem] max-w-full border-foreground/10 bg-background/60 text-foreground/78 hover:bg-foreground/4">
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
                                  "border-foreground/12 bg-foreground/4 text-foreground/72",
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
                    {canRemove ? (
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="border-foreground/10 bg-transparent text-foreground/52 hover:border-destructive/25 hover:bg-destructive/10 hover:text-destructive"
                              onClick={() => onRemovingMemberChange(member)}
                              disabled={isRemovingMember}
                              aria-label={`Remove ${member.email}`}
                            >
                              <HugeiconsIcon icon={Delete01Icon} strokeWidth={1.8} />
                            </Button>
                          }
                        />
                        <TooltipContent side="bottom" align="end">
                          Remove from team
                        </TooltipContent>
                      </Tooltip>
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
        <DialogContent className="border-foreground/10 bg-background text-foreground sm:max-w-md">
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
