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
import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

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

function memberPrimaryLabel(member: Pick<AssignableIssueMember, "displayName" | "email">) {
  const name = member.displayName.trim();
  return name.length > 0 ? name : member.email;
}

function memberSearchValue(
  member: Pick<AssignableIssueMember, "userId" | "displayName" | "email">,
) {
  return `${member.userId} ${member.displayName} ${member.email}`;
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

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant={size === "ghost" ? "ghost" : "outline"}
            size={size === "sm" ? "sm" : "default"}
            disabled={disabled || isLoading}
            aria-label={intl.formatMessage(messages.triggerAria)}
            className={cn(
              "justify-between gap-2 font-normal",
              size === "ghost" && "h-auto px-2 py-1.5 hover:bg-muted/60",
              triggerClassName,
            )}
          />
        }
      >
        <span className={cn("min-w-0 flex-1 truncate text-left", className)}>{triggerLabel}</span>
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          strokeWidth={2}
          className="size-4 shrink-0 text-muted-foreground"
        />
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
