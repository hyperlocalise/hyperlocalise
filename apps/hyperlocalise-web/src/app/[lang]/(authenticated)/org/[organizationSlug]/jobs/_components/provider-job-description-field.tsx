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
import { useState } from "react";
import { Edit02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import {
  MarkdownDescriptionEditor,
  MarkdownDescriptionPreview,
} from "@/components/markdown-description-editor/markdown-description-editor";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api-client-instance";

import { providerJobDescriptionFieldMessages } from "./provider-job-description-field.messages";

export function ProviderJobDescriptionFieldView({
  description,
  editable,
  initialDraft,
  initialIsEditing = false,
  isSaving = false,
  onSaveDescription,
  onSaveError,
}: {
  description: string;
  editable: boolean;
  initialDraft?: string;
  initialIsEditing?: boolean;
  isSaving?: boolean;
  onSaveDescription?: (description: string) => Promise<string | void>;
  onSaveError?: (error: unknown) => void;
}) {
  const intl = useIntl();
  const [isEditing, setIsEditing] = useState(initialIsEditing);
  const [draftState, setDraftState] = useState({
    baseDescription: description,
    draft: initialDraft ?? description,
  });
  const draft = draftState.baseDescription === description ? draftState.draft : description;
  const isDirty = draft !== description;
  const [internalIsSaving, setInternalIsSaving] = useState(false);
  const savePending = isSaving || internalIsSaving;
  const noDescription = intl.formatMessage(providerJobDescriptionFieldMessages.noDescription);

  if (!editable) {
    if (!description.trim()) {
      return <p className="text-sm text-muted-foreground">{noDescription}</p>;
    }

    return (
      <MarkdownDescriptionPreview value={description} className="border-border bg-transparent" />
    );
  }

  if (!isEditing) {
    return (
      <div className="group/description relative">
        <MarkdownDescriptionPreview
          value={description}
          emptyMessage={noDescription}
          className="border-border bg-transparent pr-12"
        />
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label={intl.formatMessage(providerJobDescriptionFieldMessages.editAriaLabel)}
          className="absolute top-2 right-2 text-muted-foreground hover:text-foreground"
          onClick={() => {
            setDraftState({ baseDescription: description, draft: description });
            setIsEditing(true);
          }}
        >
          <HugeiconsIcon icon={Edit02Icon} strokeWidth={1.8} />
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <MarkdownDescriptionEditor
        value={draft}
        onChange={(nextDraft) => {
          setDraftState({ baseDescription: description, draft: nextDraft });
        }}
        disabled={savePending}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          disabled={!isDirty || savePending || !onSaveDescription}
          onClick={async () => {
            if (!onSaveDescription) {
              return;
            }

            setInternalIsSaving(true);
            try {
              const nextDescription = (await onSaveDescription(draft)) ?? draft;
              setDraftState({ baseDescription: nextDescription, draft: nextDescription });
              setIsEditing(false);
            } catch (error) {
              onSaveError?.(error);
            } finally {
              setInternalIsSaving(false);
            }
          }}
        >
          {savePending ? (
            <FormattedMessage {...providerJobDescriptionFieldMessages.saving} />
          ) : (
            <FormattedMessage {...providerJobDescriptionFieldMessages.saveDescription} />
          )}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!isDirty || savePending}
          onClick={() => {
            setDraftState({ baseDescription: description, draft: description });
          }}
        >
          <FormattedMessage {...providerJobDescriptionFieldMessages.reset} />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={savePending}
          onClick={() => {
            setDraftState({ baseDescription: description, draft: description });
            setIsEditing(false);
          }}
        >
          <FormattedMessage {...providerJobDescriptionFieldMessages.cancel} />
        </Button>
      </div>
    </div>
  );
}

export function ProviderJobDescriptionField({
  organizationSlug,
  encodedJobId,
  description,
  editable,
  queryKey,
}: {
  organizationSlug: string;
  encodedJobId: string;
  description: string;
  editable: boolean;
  queryKey: readonly unknown[];
}) {
  const intl = useIntl();
  const queryClient = useQueryClient();

  const saveMutation = useMutation({
    mutationFn: async (nextDraft: string) => {
      const response = await apiClient.api.orgs[":organizationSlug"]["tms-provider"].jobs[
        ":encodedJobId"
      ].description.$patch({
        param: { organizationSlug, encodedJobId },
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
        job: { externalProviderPayload?: Record<string, unknown> };
      };
      const nextDescription =
        typeof body.job.externalProviderPayload?.description === "string"
          ? body.job.externalProviderPayload.description
          : nextDraft;

      queryClient.setQueryData(queryKey, (current: unknown) => {
        if (!current || typeof current !== "object" || Array.isArray(current)) {
          return body.job;
        }

        const currentJob = current as { externalProviderPayload?: Record<string, unknown> };
        return {
          ...currentJob,
          externalProviderPayload: {
            ...currentJob.externalProviderPayload,
            ...body.job.externalProviderPayload,
          },
        };
      });

      return nextDescription;
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
