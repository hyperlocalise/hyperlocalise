"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { MarkdownDescriptionEditor } from "@/components/markdown-description-editor";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api-client-instance";

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
  const [draftState, setDraftState] = useState({
    baseDescription: description,
    draft: description,
  });
  const draft = draftState.baseDescription === description ? draftState.draft : description;
  const isDirty = draft !== description;

  const saveMutation = useMutation({
    mutationFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"]["tms-provider"].jobs[
        ":encodedJobId"
      ].description.$patch({
        param: { organizationSlug, encodedJobId },
        json: { description: draft },
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

      return response.json() as Promise<{
        job: { externalProviderPayload?: Record<string, unknown> };
      }>;
    },
    onSuccess: ({ job }) => {
      const nextDescription =
        typeof job.externalProviderPayload?.description === "string"
          ? job.externalProviderPayload.description
          : draft;

      queryClient.setQueryData(queryKey, (current: unknown) => {
        if (!current || typeof current !== "object" || Array.isArray(current)) {
          return job;
        }

        const currentJob = current as { externalProviderPayload?: Record<string, unknown> };
        return {
          ...currentJob,
          externalProviderPayload: {
            ...currentJob.externalProviderPayload,
            ...job.externalProviderPayload,
          },
        };
      });
      setDraftState({ baseDescription: nextDescription, draft: nextDescription });
      toast.success("Description saved");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to save description");
    },
  });

  if (!editable) {
    if (!description.trim()) {
      return <p className="text-sm text-foreground/42">No description</p>;
    }

    return (
      <MarkdownDescriptionEditor
        value={description}
        onChange={() => {}}
        disabled
        className="border-foreground/8 bg-transparent"
      />
    );
  }

  return (
    <div className="space-y-3">
      <MarkdownDescriptionEditor
        value={draft}
        onChange={(nextDraft) => {
          setDraftState({ baseDescription: description, draft: nextDraft });
        }}
        disabled={saveMutation.isPending}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          disabled={!isDirty || saveMutation.isPending}
          onClick={() => saveMutation.mutate()}
        >
          {saveMutation.isPending ? "Saving…" : "Save description"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!isDirty || saveMutation.isPending}
          onClick={() => {
            setDraftState({ baseDescription: description, draft: description });
          }}
        >
          Reset
        </Button>
      </div>
    </div>
  );
}
