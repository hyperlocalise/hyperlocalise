"use client";

import { useState } from "react";
import { Add01Icon, Delete01Icon, UserGroupIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { TypographyP } from "@/components/ui/typography";
import { apiClient } from "@/lib/api-client-instance";
import type { OrganizationMembershipRole } from "@/lib/database/types";
import { cn } from "@/lib/primitives/cn";

import { WorkspacePeopleNav } from "../../_components/workspace-people-nav";
import { PageHeader, WorkspacePageShell } from "../../_components/workspace-resource-shared";

import { membersPageContentMessages } from "./members-page-content.messages";
import {
  getMembershipStatusLabel,
  getRoleBadgeClassName,
  getRoleBadgeVariant,
  getRoleDescription,
  getRoleLabel,
  resolveMembersPageState,
  type MembersListResponse,
  type MembersSettingsIntl,
} from "./members-settings-view-model";

const membersQueryKey = (organizationSlug: string) => ["workspace-members", organizationSlug];

function MemberAvatar({
  displayName,
  avatarUrl,
}: {
  displayName: string;
  avatarUrl: string | null | undefined;
}) {
  return (
    <Avatar className="size-11 border border-border bg-background/60">
      {avatarUrl ? <AvatarImage src={avatarUrl} alt={displayName} /> : null}
      <AvatarFallback className="bg-skeleton text-xs font-medium text-subtle-foreground">
        {memberInitials(displayName)}
      </AvatarFallback>
    </Avatar>
  );
}

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

function RoleSelectItem({
  role,
  intl,
}: {
  role: OrganizationMembershipRole;
  intl: MembersSettingsIntl;
}) {
  return (
    <SelectItem
      value={role}
      className="items-start py-2 [&>:first-child]:w-full [&>:first-child]:min-w-0 [&>:first-child]:shrink [&>:first-child]:whitespace-normal"
    >
      <div className="flex min-w-0 flex-col gap-0.5 text-start">
        <span className="font-medium">{getRoleLabel(role, intl)}</span>
        <p className="text-pretty text-xs leading-5 wrap-break-word text-muted-foreground">
          {getRoleDescription(role, intl)}
        </p>
      </div>
    </SelectItem>
  );
}

function StatusBadge({
  status,
  intl,
}: {
  status: MembersListResponse["members"][number]["status"];
  intl: MembersSettingsIntl;
}) {
  const isPending = status === "invited";

  return (
    <Badge
      variant="outline"
      className={cn(
        "w-fit rounded-full border px-2.5 py-0.5 text-xs font-medium",
        isPending
          ? "border-bud-700/30 bg-bud-100 text-gray-900 dark:border-bud-500/25 dark:bg-bud-500/10 dark:text-bud-300"
          : "border-grove-500/35 bg-grove-100 text-grove-900 dark:border-grove-300/20 dark:bg-grove-300/10 dark:text-grove-300",
      )}
    >
      {getMembershipStatusLabel(status ?? "active", intl)}
    </Badge>
  );
}

function MembersTableHeader() {
  return (
    <div
      role="row"
      className="hidden grid-cols-[minmax(0,1.5fr)_9rem_minmax(12rem,1fr)_2.5rem] gap-4 border-b border-border px-1 py-2.5 text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase md:grid"
    >
      <div role="columnheader">
        <FormattedMessage {...membersPageContentMessages.columnMember} />
      </div>
      <div role="columnheader">
        <FormattedMessage {...membersPageContentMessages.columnStatus} />
      </div>
      <div role="columnheader">
        <FormattedMessage {...membersPageContentMessages.columnRole} />
      </div>
      <div role="columnheader" className="text-end">
        <FormattedMessage {...membersPageContentMessages.columnActions} />
      </div>
    </div>
  );
}

export function MembersPageContent({ organizationSlug }: { organizationSlug: string }) {
  const intl = useIntl();
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
        throw new Error(
          await readMemberError(
            response,
            intl.formatMessage(membersPageContentMessages.loadFailed),
          ),
        );
      }
      return (await response.json()) as MembersListResponse;
    },
  });

  const pageState = resolveMembersPageState(membersQuery.data, intl);
  const { members, assignableRoles, canInvite } = pageState;

  const inviteMember = useMutation({
    mutationFn: async (input: { email: string; role: OrganizationMembershipRole }) => {
      const response = await apiClient.api.orgs[":organizationSlug"].members.$post({
        param: { organizationSlug },
        json: input,
      });
      if (!response.ok) {
        throw new Error(
          await readMemberError(
            response,
            intl.formatMessage(membersPageContentMessages.inviteFailed),
          ),
        );
      }
      return response.json();
    },
    onSuccess: async () => {
      setInviteEmail("");
      setInviteRole("member");
      setIsInviteOpen(false);
      await queryClient.invalidateQueries({ queryKey: membersQueryKey(organizationSlug) });
      toast.success(intl.formatMessage(membersPageContentMessages.invitationSentToast));
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
        throw new Error(
          await readMemberError(
            response,
            intl.formatMessage(membersPageContentMessages.updateRoleFailed),
          ),
        );
      }
      return response.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: membersQueryKey(organizationSlug) });
      toast.success(intl.formatMessage(membersPageContentMessages.roleUpdatedToast));
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
        throw new Error(
          await readMemberError(
            response,
            intl.formatMessage(membersPageContentMessages.removeFailed),
          ),
        );
      }
    },
    onSuccess: async () => {
      const wasInvited = removingMember?.status === "invited";
      setRemovingMember(null);
      await queryClient.invalidateQueries({ queryKey: membersQueryKey(organizationSlug) });
      toast.success(
        intl.formatMessage(
          wasInvited
            ? membersPageContentMessages.invitationRevokedToast
            : membersPageContentMessages.memberRemovedToast,
        ),
      );
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
    <WorkspacePageShell>
      <WorkspacePeopleNav organizationSlug={organizationSlug} />

      <PageHeader
        icon={UserGroupIcon}
        label={intl.formatMessage(membersPageContentMessages.pageLabel)}
        title={intl.formatMessage(membersPageContentMessages.pageTitle)}
        description={intl.formatMessage(membersPageContentMessages.pageDescription)}
        actions={
          canInvite ? (
            <Button
              type="button"
              onClick={() => setIsInviteOpen(true)}
              className="w-full sm:w-fit"
              disabled={inviteMember.isPending}
            >
              <HugeiconsIcon icon={Add01Icon} strokeWidth={1.8} />
              <FormattedMessage {...membersPageContentMessages.inviteMember} />
            </Button>
          ) : null
        }
      />

      <section
        aria-label={intl.formatMessage(membersPageContentMessages.sectionAriaLabel)}
        className="min-w-0"
      >
        {membersQuery.isLoading ? (
          <TypographyP className="py-8 text-sm text-muted-foreground">
            <FormattedMessage {...membersPageContentMessages.loading} />
          </TypographyP>
        ) : membersQuery.isError ? (
          <div className="py-8">
            <TypographyP className="text-sm font-medium text-flame-100">
              <FormattedMessage {...membersPageContentMessages.loadErrorTitle} />
            </TypographyP>
            <TypographyP className="mt-1 text-xs text-muted-foreground">
              {membersQuery.error instanceof Error
                ? membersQuery.error.message
                : intl.formatMessage(membersPageContentMessages.loadErrorFallback)}
            </TypographyP>
          </div>
        ) : members.length === 0 ? (
          <div className="py-10">
            <TypographyP className="text-sm font-medium text-foreground">
              <FormattedMessage {...membersPageContentMessages.emptyTitle} />
            </TypographyP>
            <TypographyP className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
              <FormattedMessage {...membersPageContentMessages.emptyDescription} />
            </TypographyP>
          </div>
        ) : (
          <div role="table" className="min-w-0">
            <MembersTableHeader />
            {members.map((member) => {
              const status = member.status ?? "active";
              const isPending = status === "invited";
              const roleDescription = getRoleDescription(member.role, intl);

              return (
                <div
                  key={member.email}
                  role="row"
                  className="grid gap-4 border-t border-border px-1 py-4 md:grid-cols-[minmax(0,1.5fr)_9rem_minmax(12rem,1fr)_2.5rem] md:items-center"
                >
                  <div role="cell" className="flex min-w-0 items-start gap-3">
                    <MemberAvatar displayName={member.displayName} avatarUrl={member.avatarUrl} />
                    <div className="min-w-0">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <TypographyP className="truncate text-sm font-medium text-foreground">
                          {member.displayName}
                        </TypographyP>
                        {member.isCurrentUser ? (
                          <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                            <FormattedMessage {...membersPageContentMessages.youBadge} />
                          </span>
                        ) : null}
                      </div>
                      <TypographyP className="mt-0.5 truncate text-sm text-muted-foreground">
                        {member.email}
                      </TypographyP>
                    </div>
                  </div>

                  <div role="cell" className="min-w-0">
                    <div className="flex items-center justify-between gap-3 md:block">
                      <span className="text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase md:hidden">
                        <FormattedMessage {...membersPageContentMessages.columnStatus} />
                      </span>
                      <StatusBadge status={status} intl={intl} />
                    </div>
                  </div>

                  <div role="cell" className="min-w-0">
                    <div className="flex items-center justify-between gap-3 md:block">
                      <span className="text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase md:hidden">
                        <FormattedMessage {...membersPageContentMessages.columnRole} />
                      </span>
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
                          <SelectTrigger className="h-9 w-[12rem] max-w-full border-border bg-background/60 text-subtle-foreground hover:bg-muted">
                            <SelectValue>{getRoleLabel(member.role, intl)}</SelectValue>
                          </SelectTrigger>
                          <SelectContent className="max-w-sm">
                            {assignableRoles.map((role) => (
                              <RoleSelectItem key={role} role={role} intl={intl} />
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <Badge
                                variant={getRoleBadgeVariant(member.role)}
                                className={cn(
                                  "h-auto max-w-[12rem] truncate rounded-lg px-3 py-1.5 text-sm",
                                  getRoleBadgeClassName(member.role),
                                )}
                              >
                                {getRoleLabel(member.role, intl)}
                              </Badge>
                            }
                          />
                          <TooltipContent side="bottom" align="start" className="max-w-xs">
                            {roleDescription}
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                    {member.canUpdateRole ? (
                      <TypographyP className="mt-1 hidden truncate text-xs text-muted-foreground lg:block">
                        {roleDescription}
                      </TypographyP>
                    ) : null}
                  </div>

                  <div role="cell" className="flex items-center justify-end">
                    {member.canRemove ? (
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="border-border bg-transparent text-muted-foreground hover:border-destructive/25 hover:bg-destructive/10 hover:text-destructive"
                              onClick={() => setRemovingMember(member)}
                              disabled={removeMember.isPending}
                              aria-label={
                                isPending
                                  ? intl.formatMessage(
                                      membersPageContentMessages.revokeInvitationAria,
                                      { name: member.displayName },
                                    )
                                  : intl.formatMessage(
                                      membersPageContentMessages.removeMemberAria,
                                      {
                                        name: member.displayName,
                                      },
                                    )
                              }
                            >
                              <HugeiconsIcon icon={Delete01Icon} strokeWidth={1.8} />
                            </Button>
                          }
                        />
                        <TooltipContent side="bottom" align="end">
                          {isPending ? (
                            <FormattedMessage {...membersPageContentMessages.revokeInvitation} />
                          ) : (
                            <FormattedMessage {...membersPageContentMessages.removeMember} />
                          )}
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

      <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
        <DialogContent className="border-border bg-background text-foreground sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              <FormattedMessage {...membersPageContentMessages.inviteDialogTitle} />
            </DialogTitle>
            <DialogDescription>
              <FormattedMessage {...membersPageContentMessages.inviteDialogDescription} />
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleInviteSubmit} className="grid gap-4">
            <Field>
              <FieldLabel>
                <FormattedMessage {...membersPageContentMessages.emailLabel} />
              </FieldLabel>
              <Input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder={intl.formatMessage(membersPageContentMessages.emailPlaceholder)}
                className="border-border bg-muted"
                required
              />
            </Field>
            <Field>
              <FieldLabel>
                <FormattedMessage {...membersPageContentMessages.roleLabel} />
              </FieldLabel>
              <Select
                value={inviteRole}
                onValueChange={(value) => setInviteRole(value as OrganizationMembershipRole)}
              >
                <SelectTrigger className="border-border bg-muted">
                  <SelectValue>{getRoleLabel(inviteRole, intl)}</SelectValue>
                </SelectTrigger>
                <SelectContent className="max-w-sm">
                  {assignableRoles.map((role) => (
                    <RoleSelectItem key={role} role={role} intl={intl} />
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>{getRoleDescription(inviteRole, intl)}</FieldDescription>
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsInviteOpen(false)}>
                <FormattedMessage {...membersPageContentMessages.cancel} />
              </Button>
              <Button type="submit" disabled={inviteMember.isPending}>
                <FormattedMessage {...membersPageContentMessages.sendInvitation} />
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={removingMember !== null}
        onOpenChange={(open) => !open && setRemovingMember(null)}
      >
        <DialogContent className="border-border bg-background text-foreground sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {removingMember?.status === "invited" ? (
                <FormattedMessage {...membersPageContentMessages.revokeInvitation} />
              ) : (
                <FormattedMessage {...membersPageContentMessages.removeMember} />
              )}
            </DialogTitle>
            <DialogDescription>
              {removingMember
                ? removingMember.status === "invited"
                  ? intl.formatMessage(membersPageContentMessages.revokeDialogDescription, {
                      email: removingMember.email,
                    })
                  : intl.formatMessage(membersPageContentMessages.removeDialogDescription, {
                      name: removingMember.displayName,
                    })
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRemovingMember(null)}>
              <FormattedMessage {...membersPageContentMessages.cancel} />
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
              {removingMember?.status === "invited" ? (
                <FormattedMessage {...membersPageContentMessages.revokeInvitation} />
              ) : (
                <FormattedMessage {...membersPageContentMessages.removeMember} />
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </WorkspacePageShell>
  );
}
