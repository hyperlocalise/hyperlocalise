"use client";

import { useEffect, useState } from "react";
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
  const [draft, setDraft] = useState(description);
  const isDirty = draft !== description;

  useEffect(() => {
    setDraft(description);
  }, [description]);

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
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
      toast.success("Description saved to Crowdin");
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
        onChange={setDraft}
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
          onClick={() => setDraft(description)}
        >
          Reset
        </Button>
      </div>
    </div>
  );
}
