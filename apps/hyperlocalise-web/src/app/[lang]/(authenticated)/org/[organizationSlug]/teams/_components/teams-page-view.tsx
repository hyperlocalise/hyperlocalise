"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  Add01Icon,
  Delete01Icon,
  MoreHorizontalCircle01Icon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

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
import { TypographyP } from "@/components/ui/typography";
import { cn } from "@/lib/primitives/cn";

import { WorkspacePeopleNav } from "../../_components/workspace-people-nav";
import { PageHeader, WorkspacePageShell } from "../../_components/workspace-resource-shared";

import { TeamDialog } from "./team-dialog";
import type { TeamSummaryRow } from "./teams-api";
import { createEmptyTeamForm, createTeamFormFromSummary } from "./team-form";
import { getTeamRoleLabel, resolveTeamsListPageState } from "./teams-settings-view-model";

export type TeamsLinkRenderer = (props: {
  href: string;
  children: ReactNode;
  className?: string;
}) => ReactNode;

const teamsTableColumns = "md:grid-cols-[minmax(0,1.5fr)_10rem_8rem_7rem_2.5rem]";

function defaultRenderTeamLink({ href, children, className }: Parameters<TeamsLinkRenderer>[0]) {
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

function TeamAvatar() {
  return (
    <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border bg-background/60">
      <HugeiconsIcon
        icon={UserGroupIcon}
        strokeWidth={1.7}
        className="size-4 text-muted-foreground"
      />
    </div>
  );
}

function TeamsTableHeader({ showActions }: { showActions: boolean }) {
  return (
    <div
      role="row"
      className={cn(
        "hidden gap-4 border-b border-border px-1 py-2.5 text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase md:grid",
        teamsTableColumns,
      )}
    >
      <div role="columnheader">Team</div>
      <div role="columnheader">Slug</div>
      <div role="columnheader">Your role</div>
      <div role="columnheader" className="text-right">
        Members
      </div>
      {showActions ? (
        <div role="columnheader" className="text-right">
          <span className="sr-only">Actions</span>
        </div>
      ) : null}
    </div>
  );
}

function TeamRowActions({
  team,
  organizationSlug,
  canManageTeams,
  isDeletingTeam,
  onEditTeam,
  onDeleteTeam,
}: {
  team: TeamSummaryRow;
  organizationSlug: string;
  canManageTeams: boolean;
  isDeletingTeam: boolean;
  onEditTeam: (team: TeamSummaryRow) => void;
  onDeleteTeam: (team: TeamSummaryRow) => void;
}) {
  const teamHref = `/org/${organizationSlug}/teams/${team.id}`;

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
            aria-label={`Actions for ${team.name}`}
            disabled={isDeletingTeam}
          />
        }
      >
        <HugeiconsIcon icon={MoreHorizontalCircle01Icon} strokeWidth={1.8} className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuGroup>
          <DropdownMenuItem render={<Link href={teamHref} />}>Open team</DropdownMenuItem>
          {canManageTeams ? (
            <DropdownMenuItem onClick={() => onEditTeam(team)}>Edit team...</DropdownMenuItem>
          ) : null}
          <DropdownMenuItem render={<Link href={teamHref} />}>Manage members...</DropdownMenuItem>
        </DropdownMenuGroup>
        {canManageTeams ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem
                variant="destructive"
                onClick={() => onDeleteTeam(team)}
                disabled={isDeletingTeam}
              >
                Delete team...
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function TeamsPageView({
  organizationSlug,
  teams,
  canManageTeams,
  isLoading,
  error,
  isCreateOpen,
  isCreating,
  editingTeam,
  isUpdatingTeam,
  deletingTeam,
  isDeletingTeam,
  onCreateOpenChange,
  onCreateTeam,
  onEditingTeamChange,
  onUpdateTeam,
  onDeletingTeamChange,
  onDeleteTeam,
  renderTeamLink = defaultRenderTeamLink,
}: {
  organizationSlug: string;
  teams: TeamSummaryRow[];
  canManageTeams: boolean;
  isLoading: boolean;
  error?: unknown;
  isCreateOpen: boolean;
  isCreating: boolean;
  editingTeam: TeamSummaryRow | null;
  isUpdatingTeam: boolean;
  deletingTeam: TeamSummaryRow | null;
  isDeletingTeam: boolean;
  onCreateOpenChange: (open: boolean) => void;
  onCreateTeam: (values: { name: string; slug: string }) => void;
  onEditingTeamChange: (team: TeamSummaryRow | null) => void;
  onUpdateTeam: (values: { name: string; slug: string }) => void;
  onDeletingTeamChange: (team: TeamSummaryRow | null) => void;
  onDeleteTeam: () => void;
  renderTeamLink?: TeamsLinkRenderer;
}) {
  const pageState = resolveTeamsListPageState({ teams, canManageTeams });

  return (
    <WorkspacePageShell>
      <WorkspacePeopleNav organizationSlug={organizationSlug} />

      <PageHeader
        icon={UserGroupIcon}
        label="Workspace"
        title="Teams"
        description="Group people into teams to scope projects, jobs, and localization ownership."
        actions={
          pageState.canCreateTeam ? (
            <Button
              type="button"
              onClick={() => onCreateOpenChange(true)}
              className="w-full sm:w-fit"
              disabled={isCreating}
            >
              <HugeiconsIcon icon={Add01Icon} strokeWidth={1.8} />
              Create team
            </Button>
          ) : null
        }
      />

      <section aria-label="Workspace teams" className="min-w-0">
        {isLoading ? (
          <TypographyP className="py-8 text-sm text-muted-foreground">Loading teams...</TypographyP>
        ) : error ? (
          <div className="py-8">
            <TypographyP className="text-sm font-medium text-flame-100">
              Teams failed to load.
            </TypographyP>
            <TypographyP className="mt-1 text-xs text-muted-foreground">
              {error instanceof Error ? error.message : "Refresh the page to try again."}
            </TypographyP>
          </div>
        ) : pageState.teams.length === 0 ? (
          <div className="py-10">
            <TypographyP className="text-sm font-medium text-foreground">No teams yet</TypographyP>
            <TypographyP className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
              Create a team to group workspace members and scope project access. Invite people on
              the{" "}
              <Link
                href={`/org/${organizationSlug}/members`}
                className="font-medium text-subtle-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                Members
              </Link>{" "}
              page first if your workspace is still empty.
            </TypographyP>
          </div>
        ) : (
          <div role="table" className="min-w-0">
            <TeamsTableHeader showActions />
            {pageState.teams.map((team) => (
              <div
                key={team.id}
                role="row"
                className={cn(
                  "group/row grid gap-4 border-t border-border px-1 py-3 transition-colors hover:bg-muted/40 md:items-center",
                  teamsTableColumns,
                )}
              >
                <div role="cell" className="min-w-0">
                  <div className="flex min-w-0 items-start gap-3">
                    <TeamAvatar />
                    <div className="min-w-0 flex-1">
                      {renderTeamLink({
                        href: `/org/${organizationSlug}/teams/${team.id}`,
                        className:
                          "block min-w-0 rounded-md transition-colors hover:text-foreground",
                        children: (
                          <>
                            <TypographyP className="truncate text-sm font-medium text-foreground">
                              {team.name}
                            </TypographyP>
                            <TypographyP className="mt-0.5 truncate text-sm text-muted-foreground md:hidden">
                              {team.slug}
                            </TypographyP>
                          </>
                        ),
                      })}
                    </div>
                  </div>
                </div>

                <div role="cell" className="hidden min-w-0 md:block">
                  <TypographyP className="truncate font-mono text-xs text-muted-foreground">
                    {team.slug}
                  </TypographyP>
                </div>

                <div role="cell" className="min-w-0">
                  <div className="flex items-center justify-between gap-3 md:block">
                    <span className="text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase md:hidden">
                      Your role
                    </span>
                    {team.currentUserRole ? (
                      <Badge
                        variant="outline"
                        className="w-fit rounded-full border-border bg-muted px-2.5 py-0.5 text-xs font-medium text-subtle-foreground"
                      >
                        {getTeamRoleLabel(team.currentUserRole)}
                      </Badge>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </div>
                </div>

                <div role="cell" className="flex items-center justify-between gap-3 md:justify-end">
                  <span className="text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase md:hidden">
                    Members
                  </span>
                  <span
                    className={cn(
                      "tabular-nums text-sm text-subtle-foreground",
                      "md:text-right md:text-muted-foreground",
                    )}
                  >
                    {team.memberCount}
                  </span>
                </div>

                <div role="cell" className="flex items-center justify-end">
                  <TeamRowActions
                    team={team}
                    organizationSlug={organizationSlug}
                    canManageTeams={pageState.canManageTeams}
                    isDeletingTeam={isDeletingTeam}
                    onEditTeam={onEditingTeamChange}
                    onDeleteTeam={onDeletingTeamChange}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <TeamDialog
        open={isCreateOpen}
        mode="create"
        title="Create team"
        description="Teams group workspace members and scope which projects they can access."
        initialValues={createEmptyTeamForm()}
        isSaving={isCreating}
        onOpenChange={onCreateOpenChange}
        onSubmit={onCreateTeam}
      />

      <TeamDialog
        open={editingTeam !== null}
        mode="edit"
        title="Edit team"
        description="Update the team name or slug used across the workspace."
        initialValues={editingTeam ? createTeamFormFromSummary(editingTeam) : createEmptyTeamForm()}
        isSaving={isUpdatingTeam}
        onOpenChange={(open) => !open && onEditingTeamChange(null)}
        onSubmit={onUpdateTeam}
      />

      <Dialog
        open={deletingTeam !== null}
        onOpenChange={(open) => !open && onDeletingTeamChange(null)}
      >
        <DialogContent className="border-border bg-background text-foreground sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete team</DialogTitle>
            <DialogDescription>
              {deletingTeam
                ? `${deletingTeam.name} will be removed and members will lose team-scoped access tied to it.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onDeletingTeamChange(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={!deletingTeam || isDeletingTeam}
              onClick={onDeleteTeam}
            >
              <HugeiconsIcon icon={Delete01Icon} strokeWidth={1.8} />
              Delete team
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </WorkspacePageShell>
  );
}
