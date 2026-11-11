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
import { XIcon } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useIntl } from "react-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiClient } from "@/lib/api-client-instance";

import type { JobDetailRecord } from "./job-detail-types";
import { nativeJobDueDateFieldMessages as messages } from "./native-job-due-date-field.messages";

function toDateInputValue(dueAt: string | null | undefined) {
  if (!dueAt) return "";
  const date = new Date(dueAt);
  if (Number.isNaN(date.getTime())) return "";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** A picked day means "due by the end of that day" in the viewer's time zone. */
function endOfDayIso(value: string) {
  return new Date(`${value}T23:59:59`).toISOString();
}

export function NativeJobDueDateField({
  organizationSlug,
  jobId,
  dueAt,
  queryKey,
  disabled,
}: {
  organizationSlug: string;
  jobId: string;
  dueAt: string | null | undefined;
  queryKey: readonly unknown[];
  disabled?: boolean;
}) {
  const intl = useIntl();
  const queryClient = useQueryClient();

  const saveDueAt = useMutation({
    mutationFn: async (nextDueAt: string | null) => {
      const response = await apiClient.api.orgs[":organizationSlug"].jobs[":jobId"].$patch({
        param: { organizationSlug, jobId },
        json: { dueAt: nextDueAt },
      });
      if (!response.ok) {
        throw new Error(intl.formatMessage(messages.saveFailed));
      }
      const body = (await response.json()) as { job: JobDetailRecord };
      return body.job;
    },
    onSuccess: async (job) => {
      queryClient.setQueryData(queryKey, (current: unknown) =>
        current && typeof current === "object" ? { ...current, dueAt: job.dueAt ?? null } : job,
      );
      toast.success(intl.formatMessage(messages.saveSuccess));
      await queryClient.invalidateQueries({ queryKey: ["jobs", organizationSlug] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : intl.formatMessage(messages.saveFailed));
    },
  });

  const value = toDateInputValue(dueAt);
  const isDisabled = disabled || saveDueAt.isPending;

  return (
    <div className="flex items-center gap-1">
      <Input
        type="date"
        className="h-8 w-40"
        aria-label={intl.formatMessage(messages.dueDateAriaLabel)}
        value={value}
        disabled={isDisabled}
        onChange={(event) => {
          const next = event.target.value;
          if (next === value) return;
          saveDueAt.mutate(next ? endOfDayIso(next) : null);
        }}
      />
      {value ? (
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label={intl.formatMessage(messages.clearDueDate)}
          disabled={isDisabled}
          onClick={() => saveDueAt.mutate(null)}
        >
          <XIcon />
        </Button>
      ) : null}
    </div>
  );
}
