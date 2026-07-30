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
import { useMemo, useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import { ArrowDown01Icon, UserIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/primitives/cn";

import { issueAssigneePickerMessages as messages } from "./issue-assignee-picker.messages";
import type { AssignableIssueMember } from "./use-assignable-issue-members";

const UNASSIGNED_VALUE = "__unassigned__";
const ASSIGN_TO_ME_VALUE = "__assign_to_me__";

const AVATAR_FALLBACK_COLORS = [
  "bg-emerald-600 text-white",
  "bg-sky-600 text-white",
  "bg-violet-600 text-white",
  "bg-amber-600 text-white",
  "bg-rose-600 text-white",
  "bg-teal-600 text-white",
  "bg-indigo-600 text-white",
  "bg-orange-600 text-white",
] as const;

function memberPrimaryLabel(member: Pick<AssignableIssueMember, "displayName" | "email">) {
  const name = member.displayName.trim();
  return name.length > 0 ? name : member.email;
}

function memberSearchValue(
  member: Pick<AssignableIssueMember, "userId" | "displayName" | "email">,
) {
  return `${member.userId} ${member.displayName} ${member.email}`;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function avatarFallbackClassName(seed: string) {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return AVATAR_FALLBACK_COLORS[hash % AVATAR_FALLBACK_COLORS.length];
}

function AssigneeAvatar({
  label,
  avatarUrl,
  seed,
  className,
  fallbackClassName,
}: {
  label: string;
  avatarUrl?: string | null;
  seed: string;
  className?: string;
  fallbackClassName?: string;
}) {
  return (
    <Avatar size="sm" className={cn("size-5", className)}>
      {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
      <AvatarFallback
        className={cn(
          "text-[9px] font-medium leading-none",
          avatarFallbackClassName(seed),
          fallbackClassName,
        )}
      >
        {initials(label) || "?"}
      </AvatarFallback>
    </Avatar>
  );
}

function UnassignedAvatar({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-dashed border-muted-foreground/50 text-muted-foreground",
        className,
      )}
      aria-hidden
    >
      <HugeiconsIcon icon={UserIcon} strokeWidth={1.8} className="size-3" />
    </span>
  );
}

export type IssueAssigneePickerProps = {
  value: string | null;
  onChange: (userId: string | null) => void;
  members: AssignableIssueMember[];
  currentLabel?: string | null;
  disabled?: boolean;
  isLoading?: boolean;
  className?: string;
  triggerClassName?: string;
  align?: "start" | "center" | "end";
  size?: "default" | "sm" | "ghost";
};

export function IssueAssigneePicker({
  value,
  onChange,
  members,
  currentLabel,
  disabled = false,
  isLoading = false,
  className,
  triggerClassName,
  align = "start",
  size = "default",
}: IssueAssigneePickerProps) {
  const intl = useIntl();
  const [open, setOpen] = useState(false);
  const isCompact = size === "sm";

  const selectedMember = useMemo(
    () => members.find((member) => member.userId === value) ?? null,
    [members, value],
  );
  const currentUser = useMemo(
    () => members.find((member) => member.isCurrentUser) ?? null,
    [members],
  );

  const triggerLabel = selectedMember
    ? memberPrimaryLabel(selectedMember)
    : value
      ? (currentLabel ?? intl.formatMessage(messages.unassigned))
      : intl.formatMessage(messages.unassigned);

  const triggerAvatar =
    value == null ? (
      <UnassignedAvatar />
    ) : (
      <AssigneeAvatar
        label={triggerLabel}
        avatarUrl={selectedMember?.avatarUrl}
        seed={selectedMember?.userId ?? value}
      />
    );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant={size === "ghost" ? "ghost" : isCompact ? "ghost" : "outline"}
            size={isCompact ? "icon-sm" : size === "ghost" ? "default" : "default"}
            disabled={disabled || isLoading}
            aria-label={
              isCompact
                ? `${intl.formatMessage(messages.triggerAria)}: ${triggerLabel}`
                : intl.formatMessage(messages.triggerAria)
            }
            title={isCompact ? triggerLabel : undefined}
            className={cn(
              "justify-between gap-2 font-normal",
              size === "ghost" && "h-auto px-2 py-1.5 hover:bg-muted/60",
              isCompact &&
                "size-8 shrink-0 justify-center rounded-md border-0 bg-transparent p-0 shadow-none hover:bg-muted/50",
              triggerClassName,
            )}
          />
        }
      >
        {isCompact ? (
          triggerAvatar
        ) : (
          <>
            <span className={cn("flex min-w-0 flex-1 items-center gap-2 text-left", className)}>
              {triggerAvatar}
              <span className="min-w-0 truncate">{triggerLabel}</span>
            </span>
            <HugeiconsIcon
              icon={ArrowDown01Icon}
              strokeWidth={2}
              className="size-4 shrink-0 text-muted-foreground"
            />
          </>
        )}
      </PopoverTrigger>
      <PopoverContent align={align} className="w-80 p-0" sideOffset={4}>
        <Command>
          <CommandInput placeholder={intl.formatMessage(messages.searchPlaceholder)} />
          <CommandList>
            <CommandEmpty>
              {isLoading ? (
                <FormattedMessage {...messages.loading} />
              ) : (
                <FormattedMessage {...messages.empty} />
              )}
            </CommandEmpty>
            <CommandGroup>
              <CommandItem
                value={`${UNASSIGNED_VALUE} unassigned`}
                data-checked={value == null || undefined}
                onSelect={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                <UnassignedAvatar />
                <FormattedMessage {...messages.unassigned} />
              </CommandItem>
              {currentUser ? (
                <CommandItem
                  value={`${ASSIGN_TO_ME_VALUE} ${memberSearchValue(currentUser)}`}
                  data-checked={value === currentUser.userId || undefined}
                  onSelect={() => {
                    onChange(currentUser.userId);
                    setOpen(false);
                  }}
                >
                  <AssigneeAvatar
                    label={memberPrimaryLabel(currentUser)}
                    avatarUrl={currentUser.avatarUrl}
                    seed={currentUser.userId}
                  />
                  <FormattedMessage {...messages.assignToMe} />
                </CommandItem>
              ) : null}
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading={intl.formatMessage(messages.membersGroup)}>
              {members.map((member) => (
                <CommandItem
                  key={member.userId}
                  value={memberSearchValue(member)}
                  data-checked={value === member.userId || undefined}
                  onSelect={() => {
                    onChange(member.userId);
                    setOpen(false);
                  }}
                >
                  <AssigneeAvatar
                    label={memberPrimaryLabel(member)}
                    avatarUrl={member.avatarUrl}
                    seed={member.userId}
                  />
                  <span className="min-w-0 flex-1 truncate">{memberPrimaryLabel(member)}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
