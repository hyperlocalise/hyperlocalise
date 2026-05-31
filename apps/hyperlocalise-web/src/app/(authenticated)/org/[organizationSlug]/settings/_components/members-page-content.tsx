"use client";

import { useState } from "react";
import { Add01Icon, Delete01Icon, UserGroupIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { TypographyP } from "@/components/ui/typography";
import { apiClient } from "@/lib/api-client-instance";
import type { OrganizationMembershipRole } from "@/lib/database/types";

import { PageHeader } from "../../_components/workspace-resource-shared";

import {
  getMembershipStatusLabel,
  getRoleDescription,
  getRoleLabel,
  resolveMembersPageState,
  shouldShowContractorNotice,
  type MembersListResponse,
} from "./members-settings-view-model";

const membersQueryKey = (organizationSlug: string) => ["workspace-members", organizationSlug];

function memberInitials(displayName: string) {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return "?";
  }

  if (parts.length === 1) {
    return parts[0]!.slice(0, 2).toUpperCase();
  }

  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

async function readMemberError(response: Response, fallback: string) {
  const body = await response.json().catch(() => null);

  if (body && typeof body === "object" && "message" in body && body.message) {
    return String(body.message);
  }

  if (body && typeof body === "object" && "error" in body) {
    return String(body.error);
  }

  return fallback;
}

function RoleSelectItem({ role }: { role: OrganizationMembershipRole }) {
  return (
    <SelectItem value={role} className="items-start py-2">
      <div className="flex flex-col gap-0.5 text-left">
        <span className="font-medium">{getRoleLabel(role)}</span>
        <span className="text-xs text-foreground/52">{getRoleDescription(role)}</span>
      </div>
    </SelectItem>
  );
}

export function MembersSettingsPageContent({ organizationSlug }: { organizationSlug: string }) {
  const queryClient = useQueryClient();
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<OrganizationMembershipRole>("member");
  const [removingMember, setRemovingMember] = useState<
    MembersListResponse["members"][number] | null
  >(null);

  const membersQuery = useQuery({
    queryKey: membersQueryKey(organizationSlug),
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].members.$get({
        param: { organizationSlug },
      });
      if (!response.ok) {
        throw new Error(await readMemberError(response, "Failed to load members"));
      }
      return (await response.json()) as MembersListResponse;
    },
  });

  const pageState = resolveMembersPageState(membersQuery.data);
  const { members, assignableRoles, canInvite, manualAccessNotice, contractorAccessNotice } =
    pageState;

  const inviteMember = useMutation({
    mutationFn: async (input: { email: string; role: OrganizationMembershipRole }) => {
      const response = await apiClient.api.orgs[":organizationSlug"].members.$post({
        param: { organizationSlug },
        json: input,
      });
      if (!response.ok) {
        throw new Error(await readMemberError(response, "Failed to invite member"));
      }
      return response.json();
    },
    onSuccess: async () => {
      setInviteEmail("");
      setInviteRole("member");
      setIsInviteOpen(false);
      await queryClient.invalidateQueries({ queryKey: membersQueryKey(organizationSlug) });
      toast.success("Invitation sent");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const updateRole = useMutation({
    mutationFn: async (input: { workosUserId: string; role: OrganizationMembershipRole }) => {
      const response = await apiClient.api.orgs[":organizationSlug"].members[
        ":workosUserId"
      ].$patch({
        param: { organizationSlug, workosUserId: input.workosUserId },
        json: { role: input.role },
      });
      if (!response.ok) {
        throw new Error(await readMemberError(response, "Failed to update role"));
      }
      return response.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: membersQueryKey(organizationSlug) });
      toast.success("Role updated");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const removeMember = useMutation({
    mutationFn: async (workosUserId: string) => {
      const response = await apiClient.api.orgs[":organizationSlug"].members[
        ":workosUserId"
      ].$delete({
        param: { organizationSlug, workosUserId },
      });
      if (response.status !== 204 && !response.ok) {
        throw new Error(await readMemberError(response, "Failed to remove member"));
      }
    },
    onSuccess: async () => {
      const wasInvited = removingMember?.status === "invited";
      setRemovingMember(null);
      await queryClient.invalidateQueries({ queryKey: membersQueryKey(organizationSlug) });
      toast.success(wasInvited ? "Invitation revoked" : "Member removed");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  function handleInviteSubmit(e: React.SyntheticEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) {
      return;
    }

    inviteMember.mutate({ email: inviteEmail.trim(), role: inviteRole });
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <PageHeader
          icon={UserGroupIcon}
          label="Workspace settings"
          title="Members"
          description="Manage workspace access and localization roles. Membership status reflects your identity provider; roles are assigned here."
        />
        {canInvite ? (
          <Button
            type="button"
            onClick={() => setIsInviteOpen(true)}
            className="w-full md:w-fit"
            disabled={inviteMember.isPending}
          >
            <HugeiconsIcon icon={Add01Icon} strokeWidth={1.8} />
            Invite member
          </Button>
        ) : null}
      </div>

      <Card className="rounded-lg border border-foreground/8 bg-foreground/2.5 py-0 text-foreground ring-0">
        <CardHeader className="px-5 py-5">
          <CardTitle className="text-lg font-medium text-foreground">Workspace members</CardTitle>
          <CardDescription className="text-foreground/52">{manualAccessNotice}</CardDescription>
        </CardHeader>
        <Separator className="bg-foreground/8" />
        <CardContent className="px-5 py-0">
          {membersQuery.isLoading ? (
            <div className="py-8 text-center text-sm text-foreground/48">Loading members...</div>
          ) : members.length === 0 ? (
            <div className="py-8 text-center text-sm text-foreground/48">
              No members yet. Invite someone to join this workspace.
            </div>
          ) : (
            <div className="divide-y divide-foreground/8">
              {members.map((member) => {
                const statusLabel = getMembershipStatusLabel(member.status ?? "active");
                const isPending = member.status === "invited";

                return (
                  <div key={member.email} className="flex items-start justify-between gap-4 py-4">
                    <div className="flex min-w-0 items-start gap-3">
                      <Avatar className="size-10 border border-foreground/10">
                        <AvatarFallback className="bg-foreground/8 text-xs font-medium text-foreground/72">
                          {memberInitials(member.displayName)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <TypographyP className="truncate text-sm font-medium text-foreground">
                            {member.displayName}
                          </TypographyP>
                          {member.isCurrentUser ? (
                            <Badge
                              variant="outline"
                              className="rounded-full border-foreground/10 bg-foreground/4 text-foreground/52"
                            >
                              You
                            </Badge>
                          ) : null}
                          <Badge
                            variant="outline"
                            className={
                              isPending
                                ? "rounded-full border-dew-500/25 bg-dew-500/10 text-dew-100"
                                : "rounded-full border-foreground/10 bg-foreground/4 text-foreground/62"
                            }
                          >
                            {statusLabel}
                          </Badge>
                        </div>
                        <TypographyP className="truncate text-sm text-foreground/48">
                          {member.email}
                        </TypographyP>
                        <TypographyP className="mt-1 text-xs text-foreground/40">
                          {getRoleLabel(member.role)} — {getRoleDescription(member.role)}
                        </TypographyP>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      {member.canUpdateRole ? (
                        <Select
                          value={member.role}
                          onValueChange={(value) => {
                            if (value === member.role) {
                              return;
                            }

                            updateRole.mutate({
                              workosUserId: member.workosUserId,
                              role: value as OrganizationMembershipRole,
                            });
                          }}
                          disabled={updateRole.isPending}
                        >
                          <SelectTrigger className="h-9 w-[9.5rem] border-foreground/10 bg-foreground/4">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="max-w-sm">
                            {assignableRoles.map((role) => (
                              <RoleSelectItem key={role} role={role} />
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge
                          variant="outline"
                          className="max-w-[9.5rem] truncate rounded-full border-foreground/10 bg-foreground/4 px-3 py-1 text-foreground/62"
                        >
                          {getRoleLabel(member.role)}
                        </Badge>
                      )}

                      {member.canRemove ? (
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="border-foreground/10 bg-transparent text-foreground/52 hover:bg-destructive/10 hover:text-destructive"
                                onClick={() => setRemovingMember(member)}
                                disabled={removeMember.isPending}
                                aria-label={
                                  isPending
                                    ? `Revoke invitation for ${member.displayName}`
                                    : `Remove ${member.displayName}`
                                }
                              >
                                <HugeiconsIcon icon={Delete01Icon} strokeWidth={1.8} />
                              </Button>
                            }
                          />
                          <TooltipContent side="bottom" align="end">
                            {isPending ? "Revoke invitation" : "Remove member"}
                          </TooltipContent>
                        </Tooltip>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
        <DialogContent className="border-foreground/10 bg-background text-foreground sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Invite member</DialogTitle>
            <DialogDescription>
              Send an invitation by email. They join after accepting through your identity provider.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleInviteSubmit} className="grid gap-4">
            <Field>
              <FieldLabel>Email</FieldLabel>
              <Input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="name@company.com"
                className="border-foreground/10 bg-foreground/4"
                required
              />
            </Field>
            <Field>
              <FieldLabel>Localization role</FieldLabel>
              <Select
                value={inviteRole}
                onValueChange={(value) => setInviteRole(value as OrganizationMembershipRole)}
              >
                <SelectTrigger className="border-foreground/10 bg-foreground/4">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-w-sm">
                  {assignableRoles.map((role) => (
                    <RoleSelectItem key={role} role={role} />
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>{getRoleDescription(inviteRole)}</FieldDescription>
              {shouldShowContractorNotice(inviteRole) ? (
                <FieldDescription className="text-dew-100/90">
                  {contractorAccessNotice}
                </FieldDescription>
              ) : null}
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsInviteOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={inviteMember.isPending}>
                Send invitation
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={removingMember !== null}
        onOpenChange={(open) => !open && setRemovingMember(null)}
      >
        <DialogContent className="border-foreground/10 bg-background text-foreground sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {removingMember?.status === "invited" ? "Revoke invitation" : "Remove member"}
            </DialogTitle>
            <DialogDescription>
              {removingMember
                ? removingMember.status === "invited"
                  ? `${removingMember.email} will no longer be able to accept this workspace invitation.`
                  : `${removingMember.displayName} will lose access to this workspace.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRemovingMember(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={!removingMember || removeMember.isPending}
              onClick={() => {
                if (removingMember) {
                  removeMember.mutate(removingMember.workosUserId);
                }
              }}
            >
              {removingMember?.status === "invited" ? "Revoke invitation" : "Remove member"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
