"use client";

import { useState } from "react";
import { Edit02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  MarkdownDescriptionEditor,
  MarkdownDescriptionPreview,
} from "@/components/markdown-description-editor/markdown-description-editor";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api-client-instance";

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
  const [isEditing, setIsEditing] = useState(initialIsEditing);
  const [draftState, setDraftState] = useState({
    baseDescription: description,
    draft: initialDraft ?? description,
  });
  const draft = draftState.baseDescription === description ? draftState.draft : description;
  const isDirty = draft !== description;
  const [internalIsSaving, setInternalIsSaving] = useState(false);
  const savePending = isSaving || internalIsSaving;

  if (!editable) {
    if (!description.trim()) {
      return <p className="text-sm text-foreground/42">No description</p>;
    }

    return (
      <MarkdownDescriptionPreview
        value={description}
        className="border-foreground/8 bg-transparent"
      />
    );
  }

  if (!isEditing) {
    return (
      <div className="group/description relative">
        <MarkdownDescriptionPreview
          value={description}
          emptyMessage="No description"
          className="border-foreground/8 bg-transparent pr-12"
        />
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label="Edit description"
          className="absolute top-2 right-2 text-foreground/54 hover:text-foreground"
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
          {savePending ? "Saving…" : "Save description"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!isDirty || savePending}
          onClick={() => {
            setDraftState({ baseDescription: description, draft: description });
          }}
        >
          Reset
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
          Cancel
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
          body?.message ?? body?.error ?? `Failed to save description (${response.status})`,
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
      toast.success("Description saved");
    },
  });

  return (
    <ProviderJobDescriptionFieldView
      description={description}
      editable={editable}
      isSaving={saveMutation.isPending}
      onSaveDescription={(nextDescription) => saveMutation.mutateAsync(nextDescription)}
      onSaveError={(error) => {
        toast.error(error instanceof Error ? error.message : "Failed to save description");
      }}
    />
  );
}
