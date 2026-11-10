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
import { CaretDownIcon, UserIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import { isWorkspaceOperatorRole } from "@/api/auth/policy";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { apiClient } from "@/lib/api-client-instance";
import { readApiError } from "@/lib/api-error";
import { goSvcErrorMessage } from "@/lib/go-svc/go-svc-error";
import { useGoSvcClient } from "@/lib/go-svc/use-go-svc-client";
import type { MemberRecord } from "@/lib/go-svc/go-svc-client.types";

import { automationOwnerFieldMessages as messages } from "./automation-owner-field.messages";

function memberPrimaryLabel(member: Pick<MemberRecord, "displayName" | "email">) {
  const name = member.displayName.trim();
  return name.length > 0 ? name : member.email;
}

function memberSearchValue(member: Pick<MemberRecord, "userId" | "displayName" | "email">) {
  return `${member.userId} ${member.displayName} ${member.email}`;
}

function isAssignableAutomationOwner(member: MemberRecord) {
  return member.status === "active" && isWorkspaceOperatorRole(member.role);
}

export function AutomationOwnerField({
  organizationSlug,
  automationId,
  authorUserId,
  authorName,
  disabled = false,
}: {
  organizationSlug: string;
  automationId: string;
  authorUserId: string | null;
  authorName?: string | null;
  disabled?: boolean;
}) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const { client: goSvcClient } = useGoSvcClient();
  const [open, setOpen] = useState(false);

  const membersQuery = useQuery({
    queryKey: ["workspace-members", organizationSlug],
    queryFn: async () => {
      try {
        return await goSvcClient.member.list(organizationSlug);
      } catch (error) {
        throw new Error(goSvcErrorMessage(error, intl.formatMessage(messages.loadFailed)), {
          cause: error,
        });
      }
    },
  });

  const assignableMembers = useMemo(
    () => (membersQuery.data?.members ?? []).filter(isAssignableAutomationOwner),
    [membersQuery.data?.members],
  );

  const selectedMember = assignableMembers.find((member) => member.userId === authorUserId);
  const triggerLabel =
    selectedMember != null
      ? memberPrimaryLabel(selectedMember)
      : authorName?.trim() || intl.formatMessage(messages.unknownOwner);

  const saveOwner = useMutation({
    mutationFn: async (nextAuthorUserId: string) => {
      const response = await apiClient.api.orgs[":organizationSlug"].automations[
        ":automationId"
      ].$patch({
        param: { organizationSlug, automationId },
        json: { authorUserId: nextAuthorUserId },
      });
      if (response.status !== 200) {
        throw new Error(await readApiError(response, intl.formatMessage(messages.saveFailed)));
      }
      return (await response.json()).automation;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["workspace-automation", organizationSlug, automationId],
      });
      await queryClient.invalidateQueries({
        queryKey: ["workspace-automations", organizationSlug],
      });
      toast.success(intl.formatMessage(messages.saveSuccess));
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : intl.formatMessage(messages.saveFailed));
    },
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            disabled={disabled || saveOwner.isPending}
            aria-label={intl.formatMessage(messages.ownerLabel)}
            className="h-auto gap-1 px-0 py-0 text-sm font-normal text-muted-foreground hover:bg-transparent hover:text-foreground disabled:opacity-50"
          />
        }
      >
        <UserIcon className="size-4" />
        {membersQuery.isLoading ? (
          <Skeleton className="h-3.5 w-20 rounded-full bg-muted" />
        ) : (
          triggerLabel
        )}
        <CaretDownIcon className="size-3.5" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0" sideOffset={4}>
        <Command>
          <CommandInput placeholder={intl.formatMessage(messages.searchPlaceholder)} />
          <CommandList>
            <CommandEmpty>
              {membersQuery.isLoading ? (
                <FormattedMessage {...messages.loading} />
              ) : membersQuery.isError ? (
                <FormattedMessage {...messages.loadFailed} />
              ) : (
                <FormattedMessage {...messages.empty} />
              )}
            </CommandEmpty>
            <CommandGroup heading={intl.formatMessage(messages.ownersMenu)}>
              {assignableMembers.map((member) => {
                const label = memberPrimaryLabel(member);
                return (
                  <CommandItem
                    key={member.userId}
                    value={memberSearchValue(member)}
                    data-checked={authorUserId === member.userId || undefined}
                    onSelect={() => {
                      setOpen(false);
                      if (member.userId === authorUserId || saveOwner.isPending) {
                        return;
                      }
                      saveOwner.mutate(member.userId);
                    }}
                  >
                    <span className="min-w-0 flex-1 truncate">
                      <span className="block truncate">{label}</span>
                      {label !== member.email ? (
                        <span className="block truncate text-xs text-muted-foreground">
                          {member.email}
                        </span>
                      ) : null}
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
