"use client";

import { useMemo, useState } from "react";
import { Add01Icon, Delete01Icon, Edit02Icon, UserGroupIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import type { TeamRole } from "@/api/routes/team/team.schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { TypographyP } from "@/components/ui/typography";
import { apiClient } from "@/lib/api-client-instance";

import { PageHeader } from "../../_components/workspace-resource-shared";

type TeamSummary = {
  id: string;
  slug: string;
  name: string;
  memberCount: number;
  currentUserRole: TeamRole | null;
};

type TeamMember = {
  workosUserId: string;
  email: string;
  role: TeamRole;
};

type OrganizationMember = {
  workosUserId: string;
  email: string;
};

const teamsQueryKey = (organizationSlug: string) => ["teams", organizationSlug];
const teamDetailQueryKey = (organizationSlug: string, teamId: string) => [
  "team",
  organizationSlug,
  teamId,
];
const memberDirectoryQueryKey = (organizationSlug: string) => [
  "team-member-directory",
  organizationSlug,
];

function roleLabel(role: TeamRole | null) {
  if (!role) return "Org admin";
  return role === "manager" ? "Manager" : "Member";
}

function canManageMembershipForTeam(team: TeamSummary | undefined, canManageAllTeams: boolean) {
  if (!team) return false;
  return canManageAllTeams || team.currentUserRole === "manager";
}

export function TeamsSettingsPageContent({
  organizationSlug,
  canManageAllTeams,
}: {
  organizationSlug: string;
  canManageAllTeams: boolean;
}) {
  const queryClient = useQueryClient();
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [teamSlug, setTeamSlug] = useState("");
  const [selectedMemberWorkosId, setSelectedMemberWorkosId] = useState("");
  const [newMemberRole, setNewMemberRole] = useState<TeamRole>("member");

  const teamsQuery = useQuery({
    queryKey: teamsQueryKey(organizationSlug),
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].teams.$get({
        param: { organizationSlug },
      });
      if (!response.ok) {
        throw new Error("Failed to load teams");
      }
      const body = await response.json();
      return (body.teams ?? []) as TeamSummary[];
    },
  });

  const teams = teamsQuery.data ?? [];
  const selectedTeam = teams.find((team) => team.id === selectedTeamId) ?? teams[0] ?? null;
  const selectedTeamIdResolved = selectedTeam?.id ?? null;

  const teamDetailQuery = useQuery({
    queryKey: teamDetailQueryKey(organizationSlug, selectedTeamIdResolved ?? ""),
    enabled: selectedTeamIdResolved !== null,
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].teams[":teamId"].$get({
        param: { organizationSlug, teamId: selectedTeamIdResolved! },
      });
      if (!response.ok) {
        throw new Error("Failed to load team");
      }
      const body = (await response.json()) as {
        team: {
          id: string;
          name: string;
          slug: string;
          members: TeamMember[];
        };
      };
      return body.team;
    },
  });

  const memberDirectoryQuery = useQuery({
    queryKey: memberDirectoryQueryKey(organizationSlug),
    enabled: isAddMemberOpen,
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].teams["member-directory"].$get(
        {
          param: { organizationSlug },
        },
      );
      if (!response.ok) {
        throw new Error("Failed to load organization members");
      }
      const body = await response.json();
      return (body.members ?? []) as OrganizationMember[];
    },
  });

  const invalidateTeams = async () => {
    await queryClient.invalidateQueries({ queryKey: teamsQueryKey(organizationSlug) });
    if (selectedTeamIdResolved) {
      await queryClient.invalidateQueries({
        queryKey: teamDetailQueryKey(organizationSlug, selectedTeamIdResolved),
      });
    }
  };

  const createTeam = useMutation({
    mutationFn: async (input: { name: string; slug?: string }) => {
      const response = await apiClient.api.orgs[":organizationSlug"].teams.$post({
        param: { organizationSlug },
        json: input,
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        if (body && typeof body === "object" && "error" in body) {
          throw new Error(String(body.error));
        }
        throw new Error("Failed to create team");
      }
      return response.json() as Promise<{ team: { id: string } }>;
    },
    onSuccess: async (data) => {
      setIsCreateOpen(false);
      setTeamName("");
      setTeamSlug("");
      await invalidateTeams();
      setSelectedTeamId(data.team.id);
      toast.success("Team created");
    },
    onError: (error) => toast.error(error.message),
  });

  const updateTeam = useMutation({
    mutationFn: async (input: { teamId: string; name: string; slug: string }) => {
      const response = await apiClient.api.orgs[":organizationSlug"].teams[":teamId"].$patch({
        param: { organizationSlug, teamId: input.teamId },
        json: { name: input.name, slug: input.slug },
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        if (body && typeof body === "object" && "error" in body) {
          throw new Error(String(body.error));
        }
        throw new Error("Failed to update team");
      }
    },
    onSuccess: async () => {
      setIsEditOpen(false);
      await invalidateTeams();
      toast.success("Team updated");
    },
    onError: (error) => toast.error(error.message),
  });

  const deleteTeam = useMutation({
    mutationFn: async (teamId: string) => {
      const response = await apiClient.api.orgs[":organizationSlug"].teams[":teamId"].$delete({
        param: { organizationSlug, teamId },
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        if (body && typeof body === "object" && "error" in body) {
          throw new Error(String(body.error));
        }
        throw new Error("Failed to delete team");
      }
    },
    onSuccess: async () => {
      setIsDeleteOpen(false);
      setSelectedTeamId(null);
      await invalidateTeams();
      toast.success("Team deleted");
    },
    onError: (error) => toast.error(error.message),
  });

  const addMember = useMutation({
    mutationFn: async (input: { teamId: string; workosUserId: string; role: TeamRole }) => {
      const response = await apiClient.api.orgs[":organizationSlug"].teams[":teamId"].members.$post(
        {
          param: { organizationSlug, teamId: input.teamId },
          json: { workosUserId: input.workosUserId, role: input.role },
        },
      );
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        if (body && typeof body === "object" && "error" in body) {
          throw new Error(String(body.error));
        }
        throw new Error("Failed to add team member");
      }
    },
    onSuccess: async () => {
      setIsAddMemberOpen(false);
      setSelectedMemberWorkosId("");
      setNewMemberRole("member");
      await invalidateTeams();
      toast.success("Member added to team");
    },
    onError: (error) => toast.error(error.message),
  });

  const updateMemberRole = useMutation({
    mutationFn: async (input: { teamId: string; workosUserId: string; role: TeamRole }) => {
      const response = await apiClient.api.orgs[":organizationSlug"].teams[":teamId"].members.$post(
        {
          param: { organizationSlug, teamId: input.teamId },
          json: { workosUserId: input.workosUserId, role: input.role },
        },
      );
      if (!response.ok) {
        throw new Error("Failed to update member role");
      }
    },
    onSuccess: async () => {
      await invalidateTeams();
      toast.success("Member role updated");
    },
    onError: (error) => toast.error(error.message),
  });

  const removeMember = useMutation({
    mutationFn: async (input: { teamId: string; workosUserId: string }) => {
      const response = await apiClient.api.orgs[":organizationSlug"].teams[":teamId"].members[
        ":workosUserId"
      ].$delete({
        param: {
          organizationSlug,
          teamId: input.teamId,
          workosUserId: input.workosUserId,
        },
      });
      if (!response.ok) {
        throw new Error("Failed to remove team member");
      }
    },
    onSuccess: async () => {
      await invalidateTeams();
      toast.success("Member removed from team");
    },
    onError: (error) => toast.error(error.message),
  });

  const availableMembers = useMemo(() => {
    const existingIds = new Set(
      (teamDetailQuery.data?.members ?? []).map((member) => member.workosUserId),
    );
    return (memberDirectoryQuery.data ?? []).filter(
      (member) => !existingIds.has(member.workosUserId),
    );
  }, [memberDirectoryQuery.data, teamDetailQuery.data?.members]);

  const canManageMembership = canManageMembershipForTeam(
    selectedTeam ?? undefined,
    canManageAllTeams,
  );

  function openEditDialog() {
    if (!selectedTeam) return;
    setTeamName(selectedTeam.name);
    setTeamSlug(selectedTeam.slug);
    setIsEditOpen(true);
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <PageHeader
          icon={UserGroupIcon}
          label="Workspace settings"
          title="Teams"
          description="Organize workspace members into teams and control who can access team-scoped projects."
        />
        {canManageAllTeams ? (
          <Button
            type="button"
            onClick={() => setIsCreateOpen(true)}
            className="w-full md:w-fit"
            disabled={createTeam.isPending}
          >
            <HugeiconsIcon icon={Add01Icon} strokeWidth={1.8} />
            Create team
          </Button>
        ) : null}
      </div>

      <section className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Card className="rounded-lg border border-foreground/8 bg-foreground/2.5 py-0 text-foreground ring-0">
          <CardHeader className="px-5 py-5">
            <CardTitle className="text-lg font-medium text-foreground">Your teams</CardTitle>
            <CardDescription className="text-foreground/52">
              Teams you belong to or can administer in this workspace.
            </CardDescription>
          </CardHeader>
          <Separator className="bg-foreground/8" />
          <CardContent className="px-5 py-0">
            {teamsQuery.isLoading ? (
              <div className="py-8 text-center text-sm text-foreground/48">Loading teams...</div>
            ) : teams.length === 0 ? (
              <div className="py-8 text-center text-sm text-foreground/48">
                No teams yet.
                {canManageAllTeams ? " Create one to get started." : null}
              </div>
            ) : (
              <div className="divide-y divide-foreground/8">
                {teams.map((team) => {
                  const isSelected = team.id === selectedTeam?.id;
                  return (
                    <button
                      key={team.id}
                      type="button"
                      onClick={() => setSelectedTeamId(team.id)}
                      className={`flex w-full items-start justify-between gap-3 py-4 text-start transition-colors ${
                        isSelected ? "bg-foreground/4" : "hover:bg-foreground/3"
                      }`}
                    >
                      <div className="min-w-0">
                        <TypographyP className="text-sm font-medium text-foreground">
                          {team.name}
                        </TypographyP>
                        <TypographyP className="mt-1 text-xs text-foreground/42">
                          {team.memberCount} member{team.memberCount === 1 ? "" : "s"} · {team.slug}
                        </TypographyP>
                      </div>
                      <Badge
                        variant="outline"
                        className="shrink-0 rounded-full border-foreground/10 bg-foreground/4 text-foreground/52"
                      >
                        {roleLabel(team.currentUserRole)}
                      </Badge>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-lg border border-foreground/8 bg-foreground/2.5 py-0 text-foreground ring-0">
          <CardHeader className="flex flex-row items-start justify-between gap-4 px-5 py-5">
            <div>
              <CardTitle className="text-lg font-medium text-foreground">
                {selectedTeam?.name ?? "Team details"}
              </CardTitle>
              <CardDescription className="text-foreground/52">
                {selectedTeam
                  ? "Members and roles for the selected team."
                  : "Select a team to view its members."}
              </CardDescription>
            </div>
            {selectedTeam && canManageAllTeams ? (
              <div className="flex shrink-0 gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="border-foreground/10 bg-transparent"
                  onClick={openEditDialog}
                >
                  <HugeiconsIcon icon={Edit02Icon} strokeWidth={1.8} className="size-4" />
                  Edit
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="border-foreground/10 bg-transparent text-red-400 hover:border-red-500/25 hover:bg-red-500/10"
                  onClick={() => setIsDeleteOpen(true)}
                >
                  <HugeiconsIcon icon={Delete01Icon} strokeWidth={1.8} className="size-4" />
                  Delete
                </Button>
              </div>
            ) : null}
          </CardHeader>
          <Separator className="bg-foreground/8" />
          <CardContent className="px-5 py-5">
            {!selectedTeam ? (
              <div className="py-6 text-center text-sm text-foreground/48">
                Select a team from the list.
              </div>
            ) : teamDetailQuery.isLoading ? (
              <div className="py-6 text-center text-sm text-foreground/48">Loading members...</div>
            ) : (
              <div className="space-y-4">
                {canManageMembership ? (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setIsAddMemberOpen(true)}
                    disabled={addMember.isPending}
                  >
                    <HugeiconsIcon icon={Add01Icon} strokeWidth={1.8} className="size-4" />
                    Add member
                  </Button>
                ) : null}
                <div className="divide-y divide-foreground/8 rounded-lg border border-foreground/8">
                  {(teamDetailQuery.data?.members ?? []).map((member) => (
                    <div
                      key={member.workosUserId}
                      className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <TypographyP className="text-sm font-medium text-foreground">
                          {member.email}
                        </TypographyP>
                        <TypographyP className="text-xs text-foreground/42">
                          {member.workosUserId}
                        </TypographyP>
                      </div>
                      <div className="flex items-center gap-2">
                        {canManageMembership ? (
                          <Select
                            value={member.role}
                            onValueChange={(value) => {
                              if (!selectedTeamIdResolved || value === member.role) return;
                              updateMemberRole.mutate({
                                teamId: selectedTeamIdResolved,
                                workosUserId: member.workosUserId,
                                role: value as TeamRole,
                              });
                            }}
                          >
                            <SelectTrigger className="h-9 w-36 border-foreground/10 bg-foreground/4">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="member">Member</SelectItem>
                              <SelectItem value="manager">Manager</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge
                            variant="outline"
                            className="rounded-full border-foreground/10 bg-foreground/4 text-foreground/52"
                          >
                            {roleLabel(member.role)}
                          </Badge>
                        )}
                        {canManageMembership ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="border-foreground/10 bg-transparent text-red-400 hover:border-red-500/25 hover:bg-red-500/10"
                            onClick={() => {
                              if (!selectedTeamIdResolved) return;
                              removeMember.mutate({
                                teamId: selectedTeamIdResolved,
                                workosUserId: member.workosUserId,
                              });
                            }}
                            disabled={removeMember.isPending}
                          >
                            Remove
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="border-foreground/8 bg-foreground/2.5 text-foreground sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg font-medium text-foreground">Create team</DialogTitle>
            <DialogDescription className="text-foreground/52">
              Teams scope projects and membership within this workspace.
            </DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!teamName.trim()) return;
              createTeam.mutate({
                name: teamName.trim(),
                slug: teamSlug.trim() || undefined,
              });
            }}
          >
            <Field className="gap-2">
              <FieldLabel htmlFor="team-name">Name</FieldLabel>
              <Input
                id="team-name"
                value={teamName}
                onChange={(event) => setTeamName(event.target.value)}
                className="h-10 border-foreground/10 bg-foreground/4"
              />
            </Field>
            <Field className="gap-2">
              <FieldLabel htmlFor="team-slug">Slug (optional)</FieldLabel>
              <Input
                id="team-slug"
                value={teamSlug}
                onChange={(event) => setTeamSlug(event.target.value)}
                placeholder="auto-generated from name"
                className="h-10 border-foreground/10 bg-foreground/4"
              />
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!teamName.trim() || createTeam.isPending}>
                {createTeam.isPending ? "Creating..." : "Create team"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="border-foreground/8 bg-foreground/2.5 text-foreground sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg font-medium text-foreground">Edit team</DialogTitle>
          </DialogHeader>
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!selectedTeam || !teamName.trim() || !teamSlug.trim()) return;
              updateTeam.mutate({
                teamId: selectedTeam.id,
                name: teamName.trim(),
                slug: teamSlug.trim(),
              });
            }}
          >
            <Field className="gap-2">
              <FieldLabel htmlFor="edit-team-name">Name</FieldLabel>
              <Input
                id="edit-team-name"
                value={teamName}
                onChange={(event) => setTeamName(event.target.value)}
                className="h-10 border-foreground/10 bg-foreground/4"
              />
            </Field>
            <Field className="gap-2">
              <FieldLabel htmlFor="edit-team-slug">Slug</FieldLabel>
              <Input
                id="edit-team-slug"
                value={teamSlug}
                onChange={(event) => setTeamSlug(event.target.value)}
                className="h-10 border-foreground/10 bg-foreground/4"
              />
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsEditOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  !teamName.trim() || !teamSlug.trim() || updateTeam.isPending || !selectedTeam
                }
              >
                {updateTeam.isPending ? "Saving..." : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent className="border-foreground/8 bg-foreground/2.5 text-foreground sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-medium text-foreground">Delete team</DialogTitle>
            <DialogDescription className="text-foreground/52">
              This removes the team and its memberships. Teams with linked projects cannot be
              deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={!selectedTeam || deleteTeam.isPending}
              onClick={() => {
                if (selectedTeam) deleteTeam.mutate(selectedTeam.id);
              }}
            >
              {deleteTeam.isPending ? "Deleting..." : "Delete team"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isAddMemberOpen} onOpenChange={setIsAddMemberOpen}>
        <DialogContent className="border-foreground/8 bg-foreground/2.5 text-foreground sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg font-medium text-foreground">
              Add team member
            </DialogTitle>
            <DialogDescription className="text-foreground/52">
              Only workspace members can be added to a team.
            </DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!selectedTeamIdResolved || !selectedMemberWorkosId) return;
              addMember.mutate({
                teamId: selectedTeamIdResolved,
                workosUserId: selectedMemberWorkosId,
                role: newMemberRole,
              });
            }}
          >
            <Field className="gap-2">
              <FieldLabel>Workspace member</FieldLabel>
              <Select
                value={selectedMemberWorkosId}
                onValueChange={(value) => setSelectedMemberWorkosId(value ?? "")}
              >
                <SelectTrigger className="h-10 border-foreground/10 bg-foreground/4">
                  <SelectValue placeholder="Select a member" />
                </SelectTrigger>
                <SelectContent>
                  {availableMembers.map((member) => (
                    <SelectItem key={member.workosUserId} value={member.workosUserId}>
                      {member.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field className="gap-2">
              <FieldLabel>Team role</FieldLabel>
              <Select
                value={newMemberRole}
                onValueChange={(value) => setNewMemberRole(value as TeamRole)}
              >
                <SelectTrigger className="h-10 border-foreground/10 bg-foreground/4">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsAddMemberOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!selectedMemberWorkosId || addMember.isPending || !selectedTeamIdResolved}
              >
                {addMember.isPending ? "Adding..." : "Add member"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
