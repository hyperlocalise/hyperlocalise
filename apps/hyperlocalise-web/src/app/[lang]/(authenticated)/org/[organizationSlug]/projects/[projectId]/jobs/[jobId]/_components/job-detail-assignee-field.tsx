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
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import { IssueAssigneePicker } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/_components/issue-detail/issue-assignee-picker";
import {
  assignableMembersQueryKey,
  type AssignableIssueMember,
} from "@/app/[lang]/(authenticated)/org/[organizationSlug]/_components/issue-detail/use-assignable-issue-members";
import { issueSheetApiPath } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/_components/issue-detail/issue-detail-utils";
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
import { readApiResponseError } from "@/lib/api-error";
import { apiClient } from "@/lib/api-client-instance";
import { cn } from "@/lib/primitives/cn";

import { jobDetailAssigneeFieldMessages as messages } from "./job-detail-assignee-field.messages";

type CrowdinMember = {
  externalUserId: string;
  username: string;
  displayName: string;
  role?: string | null;
};

async function readUpdateError(response: Response, fallback: string) {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
    message?: string;
  } | null;
  return body?.message ?? body?.error ?? `${fallback} (${response.status})`;
}

function toggleValue(values: string[], value: string) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

export function NativeJobOwnerField({
  organizationSlug,
  projectId,
  jobId,
  ownerUserId,
  queryKey,
  disabled = false,
}: {
  organizationSlug: string;
  projectId: string;
  jobId: string;
  ownerUserId: string | null;
  queryKey: readonly unknown[];
  disabled?: boolean;
}) {
  const intl = useIntl();
  const queryClient = useQueryClient();

  const membersQuery = useQuery({
    queryKey: assignableMembersQueryKey(organizationSlug, projectId),
    queryFn: async () => {
      const response = await fetch(
        `${issueSheetApiPath(organizationSlug, projectId)}/assignable-members`,
      );
      if (!response.ok) {
        throw await readApiResponseError(response, intl.formatMessage(messages.loadMembersFailed));
      }
      const body = (await response.json()) as { members: AssignableIssueMember[] };
      return body.members;
    },
  });

  const saveOwner = useMutation({
    mutationFn: async (nextOwnerUserId: string | null) => {
      const member =
        nextOwnerUserId == null
          ? null
          : (membersQuery.data?.find((item) => item.userId === nextOwnerUserId) ?? null);
      const ownerWorkosUserId = member?.workosUserId ?? null;
      if (nextOwnerUserId && !ownerWorkosUserId) {
        throw new Error(intl.formatMessage(messages.saveFailed));
      }

      const response = await apiClient.api.orgs[":organizationSlug"].jobs[":jobId"].$patch({
        param: { organizationSlug, jobId },
        json: { ownerWorkosUserId },
      });
      if (!response.ok) {
        throw new Error(await readUpdateError(response, intl.formatMessage(messages.saveFailed)));
      }
      const body = (await response.json()) as { job: { ownerUserId: string | null } };
      return body.job;
    },
    onSuccess: async (job) => {
      queryClient.setQueryData(queryKey, (current: unknown) => {
        if (!current || typeof current !== "object" || Array.isArray(current)) {
          return job;
        }
        return { ...current, ownerUserId: job.ownerUserId };
      });
      await queryClient.invalidateQueries({ queryKey: ["jobs", organizationSlug] });
      toast.success(intl.formatMessage(messages.saveSuccess));
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : intl.formatMessage(messages.saveFailed));
    },
  });

  return (
    <IssueAssigneePicker
      value={ownerUserId}
      members={membersQuery.data ?? []}
      onChange={(next) => saveOwner.mutate(next)}
      disabled={disabled || saveOwner.isPending}
      isLoading={membersQuery.isLoading}
      size="ghost"
      currentLabel={intl.formatMessage(messages.unassigned)}
    />
  );
}

export function CrowdinJobAssigneesField({
  organizationSlug,
  encodedJobId,
  externalProjectId,
  selectedExternalUserIds,
  fallbackLabels,
  queryKey,
  disabled = false,
}: {
  organizationSlug: string;
  encodedJobId: string;
  externalProjectId: string;
  selectedExternalUserIds: string[];
  fallbackLabels: string[];
  queryKey: readonly unknown[];
  disabled?: boolean;
}) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [draftSelectedIds, setDraftSelectedIds] = useState(selectedExternalUserIds);
  const draftSelectedIdsRef = useRef(selectedExternalUserIds);
  const selectedExternalUserIdsRef = useRef(selectedExternalUserIds);
  const saveInFlightRef = useRef(false);
  const queuedSelectedIdsRef = useRef<string[] | null>(null);
  selectedExternalUserIdsRef.current = selectedExternalUserIds;

  const membersQuery = useQuery({
    queryKey: ["tms-project-members", organizationSlug, externalProjectId, "job-detail"],
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"]["tms-provider"].projects[
        ":externalProjectId"
      ].members.$get({
        param: { organizationSlug, externalProjectId },
      });
      if (!response.ok) {
        throw new Error(intl.formatMessage(messages.loadMembersFailed));
      }
      const body = (await response.json()) as { members: CrowdinMember[] };
      return body.members;
    },
  });

  const saveAssignees = useMutation({
    mutationFn: async (assigneeExternalUserIds: string[]) => {
      const response = await apiClient.api.orgs[":organizationSlug"]["tms-provider"].jobs[
        ":encodedJobId"
      ].$patch({
        param: { organizationSlug, encodedJobId },
        json: { assigneeExternalUserIds },
      });
      if (!response.ok) {
        throw new Error(await readUpdateError(response, intl.formatMessage(messages.saveFailed)));
      }
      const body = (await response.json()) as {
        job: {
          externalAssignedUsers?: string[] | null;
          externalProviderPayload?: Record<string, unknown>;
        };
      };
      return body.job;
    },
    onSuccess: async (job) => {
      queryClient.setQueryData(queryKey, (current: unknown) => {
        if (!current || typeof current !== "object" || Array.isArray(current)) {
          return job;
        }
        const currentJob = current as {
          externalAssignedUsers?: string[] | null;
          externalProviderPayload?: Record<string, unknown>;
        };
        return {
          ...currentJob,
          externalAssignedUsers: job.externalAssignedUsers ?? currentJob.externalAssignedUsers,
          externalProviderPayload: {
            ...currentJob.externalProviderPayload,
            ...job.externalProviderPayload,
          },
        };
      });
      await queryClient.invalidateQueries({ queryKey: ["jobs", organizationSlug] });
      toast.success(intl.formatMessage(messages.saveSuccess));
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : intl.formatMessage(messages.saveFailed));
    },
  });

  useEffect(() => {
    if (!saveInFlightRef.current && queuedSelectedIdsRef.current == null) {
      draftSelectedIdsRef.current = selectedExternalUserIds;
      setDraftSelectedIds(selectedExternalUserIds);
    }
  }, [selectedExternalUserIds]);

  const persistAssignees = (next: string[]) => {
    draftSelectedIdsRef.current = next;
    setDraftSelectedIds(next);
    if (saveInFlightRef.current) {
      queuedSelectedIdsRef.current = next;
      return;
    }
    saveInFlightRef.current = true;
    saveAssignees.mutate(next, {
      onSettled: (_data, error) => {
        saveInFlightRef.current = false;
        const queued = queuedSelectedIdsRef.current;
        queuedSelectedIdsRef.current = null;
        if (queued) {
          persistAssignees(queued);
          return;
        }
        if (error) {
          draftSelectedIdsRef.current = selectedExternalUserIdsRef.current;
          setDraftSelectedIds(selectedExternalUserIdsRef.current);
        }
      },
    });
  };

  const members = membersQuery.data ?? [];
  const selectedSet = useMemo(() => new Set(draftSelectedIds), [draftSelectedIds]);
  const selectedLabels = useMemo(() => {
    const fromMembers = members
      .filter((member) => selectedSet.has(member.externalUserId))
      .map((member) => member.displayName || member.username);
    if (fromMembers.length > 0) {
      return fromMembers;
    }
    return fallbackLabels;
  }, [fallbackLabels, members, selectedSet]);

  const triggerLabel =
    selectedLabels.length > 0
      ? selectedLabels.join(", ")
      : intl.formatMessage(messages.selectedCount, { count: 0 });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="default"
            disabled={disabled || saveAssignees.isPending || membersQuery.isLoading}
            aria-label={intl.formatMessage(messages.triggerAria)}
            className="h-auto justify-between gap-2 px-2 py-1.5 font-normal hover:bg-muted/60"
          />
        }
      >
        <span className="min-w-0 flex-1 truncate text-left text-sm">{triggerLabel}</span>
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          strokeWidth={2}
          className="size-4 shrink-0 text-muted-foreground"
        />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0" sideOffset={4}>
        <Command>
          <CommandInput placeholder={intl.formatMessage(messages.searchPlaceholder)} />
          <CommandList>
            <CommandEmpty>
              {membersQuery.isLoading ? (
                <FormattedMessage {...messages.loading} />
              ) : (
                <FormattedMessage {...messages.empty} />
              )}
            </CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="clear-all"
                onSelect={() => {
                  persistAssignees([]);
                  setOpen(false);
                }}
              >
                <FormattedMessage {...messages.clearAll} />
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup>
              {members.map((member) => {
                const label = member.displayName || member.username;
                const checked = selectedSet.has(member.externalUserId);
                return (
                  <CommandItem
                    key={member.externalUserId}
                    value={`${member.externalUserId} ${label} ${member.username}`}
                    data-checked={checked || undefined}
                    onSelect={() => {
                      const next = toggleValue(draftSelectedIdsRef.current, member.externalUserId);
                      persistAssignees(next);
                    }}
                  >
                    <span
                      className={cn(
                        "size-3.5 shrink-0 rounded-sm border border-border",
                        checked && "bg-primary border-primary",
                      )}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate">
                      <span className="block truncate">{label}</span>
                      {member.role ? (
                        <span className="block truncate text-xs text-muted-foreground">
                          {member.username} · {member.role}
                        </span>
                      ) : (
                        <span className="block truncate text-xs text-muted-foreground">
                          {member.username}
                        </span>
                      )}
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
