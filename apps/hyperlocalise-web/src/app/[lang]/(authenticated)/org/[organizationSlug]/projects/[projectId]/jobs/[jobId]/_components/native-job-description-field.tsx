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
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useIntl } from "react-intl";
import { toast } from "sonner";

import { ProviderJobDescriptionFieldView } from "../../../../../jobs/_components/provider-job-description-field";
import { apiClient } from "@/lib/api-client-instance";

import { providerJobDescriptionFieldMessages } from "../../../../../jobs/_components/provider-job-description-field.messages";

export function NativeJobDescriptionField({
  organizationSlug,
  jobId,
  description,
  editable,
  queryKey,
}: {
  organizationSlug: string;
  jobId: string;
  description: string;
  editable: boolean;
  queryKey: readonly unknown[];
}) {
  const intl = useIntl();
  const queryClient = useQueryClient();

  const saveMutation = useMutation({
    mutationFn: async (nextDraft: string) => {
      const response = await apiClient.api.orgs[":organizationSlug"].jobs[":jobId"].$patch({
        param: { organizationSlug, jobId },
        json: { description: nextDraft },
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
          message?: string;
        } | null;
        throw new Error(
          body?.message ??
            body?.error ??
            intl.formatMessage(providerJobDescriptionFieldMessages.saveFailedWithStatus, {
              status: response.status,
            }),
        );
      }

      const body = (await response.json()) as {
        job: { inputPayload?: unknown };
      };

      queryClient.setQueryData(queryKey, (current: unknown) => {
        if (!current || typeof current !== "object" || Array.isArray(current)) {
          return body.job;
        }
        return {
          ...current,
          inputPayload: body.job.inputPayload,
        };
      });

      return nextDraft;
    },
    onSuccess: () => {
      toast.success(intl.formatMessage(providerJobDescriptionFieldMessages.saveSuccess));
    },
  });

  return (
    <ProviderJobDescriptionFieldView
      description={description}
      editable={editable}
      isSaving={saveMutation.isPending}
      onSaveDescription={(nextDescription) => saveMutation.mutateAsync(nextDescription)}
      onSaveError={(error) => {
        toast.error(
          error instanceof Error
            ? error.message
            : intl.formatMessage(providerJobDescriptionFieldMessages.saveFailedFallback),
        );
      }}
    />
  );
}
