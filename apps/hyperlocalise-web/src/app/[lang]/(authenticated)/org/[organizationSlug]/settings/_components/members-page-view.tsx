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
import Link from "next/link";
import { Add01Icon, MoreHorizontalCircle01Icon, UserGroupIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormattedMessage, useIntl } from "react-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Column } from "@/components/ui/layout/column";
import { Columns } from "@/components/ui/layout/columns";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
import { Spinner } from "@/components/ui/spinner";
import { TypographyP } from "@/components/ui/typography";
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
  type MembersListMember,
  type MembersSettingsIntl,
} from "./members-settings-view-model";

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
      label={getRoleLabel(role, intl)}
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
  status: MembersListMember["status"];
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

function RoleBadge({
  role,
  intl,
}: {
  role: OrganizationMembershipRole;
  intl: MembersSettingsIntl;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Badge
            variant={getRoleBadgeVariant(role)}
            className={cn(
              "h-auto max-w-[12rem] truncate rounded-lg px-3 py-1.5 text-sm",
              getRoleBadgeClassName(role),
            )}
          >
            {getRoleLabel(role, intl)}
          </Badge>
        }
      />
      <TooltipContent side="bottom" align="start" className="max-w-xs">
        {getRoleDescription(role, intl)}
      </TooltipContent>
    </Tooltip>
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

function MemberRowActions({
  member,
  canUpdateRole,
  canRemove,
  isBusy,
  onChangeRole,
  onRemove,
}: {
  member: MembersListMember;
  canUpdateRole: boolean;
  canRemove: boolean;
  isBusy: boolean;
  onChangeRole: (member: MembersListMember) => void;
  onRemove: (member: MembersListMember) => void;
}) {
  const intl = useIntl();
  const isPending = (member.status ?? "active") === "invited";

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
            aria-label={intl.formatMessage(membersPageContentMessages.actionsForMember, {
              name: member.displayName,
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
              <FormattedMessage {...membersPageContentMessages.changeRole} />
            </DropdownMenuItem>
          </DropdownMenuGroup>
        ) : null}
        {canUpdateRole && canRemove ? <DropdownMenuSeparator /> : null}
        {canRemove ? (
          <DropdownMenuGroup>
            <DropdownMenuItem
              variant="destructive"
              onClick={() => onRemove(member)}
              disabled={isBusy}
            >
              {isPending ? (
                <FormattedMessage {...membersPageContentMessages.revokeInvitationMenu} />
              ) : (
                <FormattedMessage {...membersPageContentMessages.removeMemberMenu} />
              )}
            </DropdownMenuItem>
          </DropdownMenuGroup>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ChangeMemberRoleDialog({
  member,
  assignableRoles,
  isSaving,
  onOpenChange,
  onSubmit,
}: {
  member: MembersListMember | null;
  assignableRoles: OrganizationMembershipRole[];
  isSaving: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: { workosUserId: string; role: OrganizationMembershipRole }) => void;
}) {
  const intl = useIntl();
  const [role, setRole] = useState<OrganizationMembershipRole>(member?.role ?? "member");

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
              <FormattedMessage {...membersPageContentMessages.changeRoleTitle} />
            </DialogTitle>
            <DialogDescription>
              {member
                ? intl.formatMessage(membersPageContentMessages.changeRoleDescription, {
                    name: member.displayName,
                  })
                : ""}
            </DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel>
              <FormattedMessage {...membersPageContentMessages.roleLabel} />
            </FieldLabel>
            <Select
              value={role}
              onValueChange={(value) => setRole(value as OrganizationMembershipRole)}
              disabled={isSaving}
            >
              <SelectTrigger className="border-border bg-muted">
                <SelectValue>{getRoleLabel(role, intl)}</SelectValue>
              </SelectTrigger>
              <SelectContent className="max-w-sm">
                {assignableRoles.map((assignableRole) => (
                  <RoleSelectItem key={assignableRole} role={assignableRole} intl={intl} />
                ))}
              </SelectContent>
            </Select>
            <FieldDescription>{getRoleDescription(role, intl)}</FieldDescription>
          </Field>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isSaving}
              onClick={() => onOpenChange(false)}
            >
              <FormattedMessage {...membersPageContentMessages.cancel} />
            </Button>
            <Button type="submit" disabled={isSaving || !member || role === member.role}>
              {isSaving ? <Spinner /> : null}
              {isSaving ? (
                <FormattedMessage {...membersPageContentMessages.updatingRole} />
              ) : (
                <FormattedMessage {...membersPageContentMessages.updateRole} />
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function MembersPageView({
  organizationSlug,
  members,
  assignableRoles,
  canInvite,
  isLoading,
  loadError,
  isInviteOpen,
  inviteEmail,
  inviteRole,
  isInviting,
  removingMember,
  isRemoving,
  editingMember,
  isUpdatingRole,
  onInviteOpenChange,
  onInviteEmailChange,
  onInviteRoleChange,
  onInviteSubmit,
  onRemovingMemberChange,
  onRemoveMember,
  onEditingMemberChange,
  onUpdateRole,
}: {
  organizationSlug: string;
  members: MembersListMember[];
  assignableRoles: OrganizationMembershipRole[];
  canInvite: boolean;
  isLoading: boolean;
  loadError: string | null;
  isInviteOpen: boolean;
  inviteEmail: string;
  inviteRole: OrganizationMembershipRole;
  isInviting: boolean;
  removingMember: MembersListMember | null;
  isRemoving: boolean;
  editingMember: MembersListMember | null;
  isUpdatingRole: boolean;
  onInviteOpenChange: (open: boolean) => void;
  onInviteEmailChange: (email: string) => void;
  onInviteRoleChange: (role: OrganizationMembershipRole) => void;
  onInviteSubmit: (event: React.SyntheticEvent) => void;
  onRemovingMemberChange: (member: MembersListMember | null) => void;
  onRemoveMember: (workosUserId: string) => void;
  onEditingMemberChange: (member: MembersListMember | null) => void;
  onUpdateRole: (input: { workosUserId: string; role: OrganizationMembershipRole }) => void;
}) {
  const intl = useIntl();

  return (
    <WorkspacePageShell>
      <WorkspacePeopleNav organizationSlug={organizationSlug} />

      <PageHeader
        icon={UserGroupIcon}
        label={intl.formatMessage(membersPageContentMessages.pageLabel)}
        title={intl.formatMessage(membersPageContentMessages.pageTitle)}
        description={intl.formatMessage(membersPageContentMessages.pageDescription)}
        actions={
          <Columns spacing="1u" alignY="center" collapseBelow="small">
            <Column width="containedContent">
              <Button
                nativeButton={false}
                variant="ghost"
                render={<Link href={`/org/${organizationSlug}/members/permissions`} />}
                className="w-full sm:w-fit"
              >
                <FormattedMessage {...membersPageContentMessages.rolePermissions} />
              </Button>
            </Column>
            {canInvite ? (
              <Column width="containedContent">
                <Button
                  type="button"
                  onClick={() => onInviteOpenChange(true)}
                  className="w-full sm:w-fit"
                  disabled={isInviting}
                >
                  <HugeiconsIcon icon={Add01Icon} strokeWidth={1.8} />
                  <FormattedMessage {...membersPageContentMessages.inviteMember} />
                </Button>
              </Column>
            ) : null}
          </Columns>
        }
      />

      <section
        aria-label={intl.formatMessage(membersPageContentMessages.sectionAriaLabel)}
        className="min-w-0"
      >
        {isLoading ? (
          <TypographyP className="py-8 text-sm text-muted-foreground">
            <FormattedMessage {...membersPageContentMessages.loading} />
          </TypographyP>
        ) : loadError ? (
          <div className="py-8">
            <TypographyP className="text-sm font-medium text-flame-100">
              <FormattedMessage {...membersPageContentMessages.loadErrorTitle} />
            </TypographyP>
            <TypographyP className="mt-1 text-xs text-muted-foreground">{loadError}</TypographyP>
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

              return (
                <div
                  key={member.email}
                  role="row"
                  className="group/row grid gap-4 border-t border-border px-1 py-4 transition-colors hover:bg-muted/40 md:grid-cols-[minmax(0,1.5fr)_9rem_minmax(12rem,1fr)_2.5rem] md:items-center"
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
                      <RoleBadge role={member.role} intl={intl} />
                    </div>
                  </div>

                  <div role="cell" className="flex items-center justify-end">
                    <MemberRowActions
                      member={member}
                      canUpdateRole={member.canUpdateRole === true}
                      canRemove={member.canRemove === true}
                      isBusy={isRemoving || isUpdatingRole}
                      onChangeRole={onEditingMemberChange}
                      onRemove={onRemovingMemberChange}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <Dialog open={isInviteOpen} onOpenChange={onInviteOpenChange}>
        <DialogContent className="border-border bg-background text-foreground sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              <FormattedMessage {...membersPageContentMessages.inviteDialogTitle} />
            </DialogTitle>
            <DialogDescription>
              <FormattedMessage {...membersPageContentMessages.inviteDialogDescription} />
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onInviteSubmit} className="grid gap-4">
            <Field>
              <FieldLabel>
                <FormattedMessage {...membersPageContentMessages.emailLabel} />
              </FieldLabel>
              <Input
                type="email"
                value={inviteEmail}
                onChange={(e) => onInviteEmailChange(e.target.value)}
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
                onValueChange={(value) => onInviteRoleChange(value as OrganizationMembershipRole)}
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
              <Button type="button" variant="outline" onClick={() => onInviteOpenChange(false)}>
                <FormattedMessage {...membersPageContentMessages.cancel} />
              </Button>
              <Button type="submit" disabled={isInviting}>
                <FormattedMessage {...membersPageContentMessages.sendInvitation} />
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ChangeMemberRoleDialog
        member={editingMember}
        assignableRoles={assignableRoles}
        isSaving={isUpdatingRole}
        onOpenChange={(open) => {
          if (!open) {
            onEditingMemberChange(null);
          }
        }}
        onSubmit={onUpdateRole}
      />

      <Dialog
        open={removingMember !== null}
        onOpenChange={(open) => !open && onRemovingMemberChange(null)}
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
            <Button type="button" variant="outline" onClick={() => onRemovingMemberChange(null)}>
              <FormattedMessage {...membersPageContentMessages.cancel} />
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={!removingMember || isRemoving}
              onClick={() => {
                if (removingMember) {
                  onRemoveMember(removingMember.workosUserId);
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
