"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Add01Icon, UserGroupIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TypographyP } from "@/components/ui/typography";
import { cn } from "@/lib/primitives/cn";

import { WorkspacePeopleNav } from "../../_components/workspace-people-nav";
import { PageHeader, WorkspacePageShell } from "../../_components/workspace-resource-shared";

import { TeamDialog } from "./team-dialog";
import type { TeamSummaryRow } from "./teams-api";
import { createEmptyTeamForm } from "./team-form";
import { getTeamRoleLabel, resolveTeamsListPageState } from "./teams-settings-view-model";

export type TeamsLinkRenderer = (props: {
  href: string;
  children: ReactNode;
  className?: string;
}) => ReactNode;

function defaultRenderTeamLink({ href, children, className }: Parameters<TeamsLinkRenderer>[0]) {
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
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
  onCreateOpenChange,
  onCreateTeam,
  renderTeamLink = defaultRenderTeamLink,
}: {
  organizationSlug: string;
  teams: TeamSummaryRow[];
  canManageTeams: boolean;
  isLoading: boolean;
  error?: unknown;
  isCreateOpen: boolean;
  isCreating: boolean;
  onCreateOpenChange: (open: boolean) => void;
  onCreateTeam: (values: { name: string; slug: string }) => void;
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
          <TypographyP className="py-8 text-sm text-foreground/52">Loading teams...</TypographyP>
        ) : error ? (
          <div className="py-8">
            <TypographyP className="text-sm font-medium text-flame-100">
              Teams failed to load.
            </TypographyP>
            <TypographyP className="mt-1 text-xs text-foreground/48">
              {error instanceof Error ? error.message : "Refresh the page to try again."}
            </TypographyP>
          </div>
        ) : pageState.teams.length === 0 ? (
          <div className="py-10">
            <TypographyP className="text-sm font-medium text-foreground">No teams yet</TypographyP>
            <TypographyP className="mt-2 max-w-xl text-sm leading-6 text-foreground/52">
              Create a team to group workspace members and scope project access. Invite people on
              the{" "}
              <Link
                href={`/org/${organizationSlug}/members`}
                className="font-medium text-foreground/72 underline-offset-4 hover:text-foreground hover:underline"
              >
                Members
              </Link>{" "}
              page first if your workspace is still empty.
            </TypographyP>
          </div>
        ) : (
          <div role="table" className="min-w-0">
            <div
              role="row"
              className="hidden grid-cols-[minmax(0,1.4fr)_10rem_8rem_7rem] gap-4 border-b border-foreground/8 px-1 py-2.5 text-xs font-medium tracking-[0.08em] text-foreground/36 uppercase md:grid"
            >
              <div role="columnheader">Team</div>
              <div role="columnheader">Slug</div>
              <div role="columnheader">Your role</div>
              <div role="columnheader" className="text-right">
                Members
              </div>
            </div>

            {pageState.teams.map((team) => (
              <div
                key={team.id}
                role="row"
                className="grid gap-4 border-t border-foreground/8 px-1 py-4 md:grid-cols-[minmax(0,1.4fr)_10rem_8rem_7rem] md:items-center"
              >
                <div role="cell" className="min-w-0">
                  {renderTeamLink({
                    href: `/org/${organizationSlug}/teams/${team.id}`,
                    className: "block min-w-0 rounded-md transition-colors hover:bg-foreground/4",
                    children: (
                      <div className="px-2 py-1">
                        <TypographyP className="truncate text-sm font-medium text-foreground">
                          {team.name}
                        </TypographyP>
                        <TypographyP className="mt-0.5 truncate text-xs text-foreground/48 md:hidden">
                          {team.slug}
                        </TypographyP>
                      </div>
                    ),
                  })}
                </div>

                <div role="cell" className="hidden min-w-0 md:block">
                  <TypographyP className="truncate font-mono text-xs text-foreground/56">
                    {team.slug}
                  </TypographyP>
                </div>

                <div role="cell" className="min-w-0">
                  <div className="flex items-center justify-between gap-3 md:block">
                    <span className="text-xs font-medium tracking-[0.08em] text-foreground/34 uppercase md:hidden">
                      Your role
                    </span>
                    {team.currentUserRole ? (
                      <Badge
                        variant="outline"
                        className="w-fit rounded-full border-foreground/12 bg-foreground/4 px-2.5 py-0.5 text-xs font-medium text-foreground/72"
                      >
                        {getTeamRoleLabel(team.currentUserRole)}
                      </Badge>
                    ) : (
                      <span className="text-sm text-foreground/42">—</span>
                    )}
                  </div>
                </div>

                <div role="cell" className="flex items-center justify-between gap-3 md:justify-end">
                  <span className="text-xs font-medium tracking-[0.08em] text-foreground/34 uppercase md:hidden">
                    Members
                  </span>
                  <span
                    className={cn(
                      "tabular-nums text-sm text-foreground/68",
                      "md:text-right md:text-foreground/56",
                    )}
                  >
                    {team.memberCount}
                  </span>
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
    </WorkspacePageShell>
  );
}
