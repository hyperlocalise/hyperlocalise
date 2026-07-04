"use client";

import { useEffect, useState } from "react";
import { FloppyDiskIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { readApiError } from "@/lib/api-error";
import { apiClient } from "@/lib/api-client-instance";

import { getKnowledgeMemoryEditorState } from "./knowledge-memory-editor-state";

const knowledgeMemoryQueryKey = (organizationSlug: string) => [
  "knowledge-memory",
  organizationSlug,
];

function formatUpdatedAt(value: string | null) {
  if (!value) {
    return "Not saved yet";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function KnowledgeMemoryEditor({
  organizationSlug,
  canUpdateKnowledgeMemory,
}: {
  organizationSlug: string;
  canUpdateKnowledgeMemory: boolean;
}) {
  const queryClient = useQueryClient();
  const [content, setContent] = useState("");
  const [savedContent, setSavedContent] = useState("");

  const knowledgeMemoryQuery = useQuery({
    queryKey: knowledgeMemoryQueryKey(organizationSlug),
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"]["knowledge-memory"].$get({
        param: { organizationSlug },
      });

      if (!response.ok) {
        throw new Error(await readApiError(response, "Unable to load knowledge memory"));
      }

      const body = await response.json();
      return body.knowledgeMemory;
    },
  });

  useEffect(() => {
    if (!knowledgeMemoryQuery.data) {
      return;
    }

    setContent(knowledgeMemoryQuery.data.content);
    setSavedContent(knowledgeMemoryQuery.data.content);
  }, [knowledgeMemoryQuery.data]);

  const saveKnowledgeMemory = useMutation({
    mutationFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"]["knowledge-memory"].$put({
        param: { organizationSlug },
        json: { content },
      });

      if (!response.ok) {
        throw new Error(await readApiError(response, "Unable to save knowledge memory"));
      }

      const body = await response.json();
      return body.knowledgeMemory;
    },
    onSuccess: async (knowledgeMemory) => {
      setContent(knowledgeMemory.content);
      setSavedContent(knowledgeMemory.content);
      await queryClient.invalidateQueries({ queryKey: knowledgeMemoryQueryKey(organizationSlug) });
      toast.success("Knowledge memory saved");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const currentEditorState = getKnowledgeMemoryEditorState({
    content,
    savedContent,
    canUpdateKnowledgeMemory,
    isSaving: saveKnowledgeMemory.isPending,
  });

  return (
    <section className="space-y-5 rounded-lg border border-border bg-muted p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-sm font-medium text-foreground">Workspace memory</h2>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            A short shared note agents read during translation and review.
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          Last updated {formatUpdatedAt(knowledgeMemoryQuery.data?.updatedAt ?? null)}
        </p>
      </div>

      {knowledgeMemoryQuery.isLoading ? (
        <div className="flex min-h-48 items-center justify-center text-muted-foreground">
          <Spinner />
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (currentEditorState.canSave) {
              saveKnowledgeMemory.mutate();
            }
          }}
        >
          <Field data-invalid={currentEditorState.isOverLimit}>
            <FieldLabel htmlFor="knowledge-memory-content">Memory.md</FieldLabel>
            <Textarea
              id="knowledge-memory-content"
              value={content}
              readOnly={!canUpdateKnowledgeMemory}
              aria-invalid={currentEditorState.isOverLimit}
              onChange={(event) => setContent(event.target.value)}
              className="min-h-64 resize-y border-border bg-background font-mono text-sm leading-6"
              placeholder="Example: Use a concise product tone. Keep feature names in English unless a locale-specific glossary says otherwise."
            />
            {currentEditorState.isOverLimit ? (
              <FieldError>
                Knowledge memory must be {currentEditorState.characterLimit} characters or less.
              </FieldError>
            ) : null}
          </Field>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              {currentEditorState.characterCount}/{currentEditorState.characterLimit} characters
            </p>
            {canUpdateKnowledgeMemory ? (
              <Button type="submit" disabled={!currentEditorState.canSave}>
                <HugeiconsIcon icon={FloppyDiskIcon} strokeWidth={1.8} />
                {saveKnowledgeMemory.isPending ? "Saving" : "Save"}
              </Button>
            ) : null}
          </div>
        </form>
      )}
    </section>
  );
}
