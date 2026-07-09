"use client";

import { useEffect, useState } from "react";
import { FloppyDiskIcon, SearchIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import type { KnowledgeMemoryPreviewResponse } from "@/api/routes/knowledge-memory/knowledge-memory.schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { readApiError } from "@/lib/api-error";
import { apiClient } from "@/lib/api-client-instance";

import { getKnowledgeMemoryEditorState } from "./knowledge-memory-editor-state";
import {
  formatMemoryReductionPercent,
  getKnowledgeMemoryPreviewState,
} from "./knowledge-memory-preview-state";

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

type MemoryPreview = KnowledgeMemoryPreviewResponse["memoryPreview"];

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
  const [previewTargetLocale, setPreviewTargetLocale] = useState("");
  const [previewSourceText, setPreviewSourceText] = useState("");
  const [memoryPreview, setMemoryPreview] = useState<MemoryPreview | null>(null);

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

  const previewKnowledgeMemory = useMutation({
    mutationFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"][
        "knowledge-memory"
      ].preview.$post({
        param: { organizationSlug },
        json: {
          targetLocale: previewTargetLocale.trim() || undefined,
          sourceText: previewSourceText.trim() || undefined,
        },
      });

      if (!response.ok) {
        throw new Error(await readApiError(response, "Unable to preview knowledge memory"));
      }

      const body = await response.json();
      return body.memoryPreview;
    },
    onSuccess: (preview) => {
      setMemoryPreview(preview);
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
  const previewState = getKnowledgeMemoryPreviewState({
    targetLocale: previewTargetLocale,
    sourceText: previewSourceText,
    isPreviewing: previewKnowledgeMemory.isPending,
  });

  return (
    <section className="space-y-5 rounded-lg border border-border bg-muted p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-sm font-medium text-foreground">Organization memory</h2>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            One markdown document for localization rules, glossary notes, brand guidance, and things
            to avoid.
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
              placeholder="Example: ## Tone&#10;- Keep product copy practical and direct.&#10;- Keep Hyperlocalise untranslated."
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

          <div className="space-y-4 border-t border-border pt-5">
            <div className="space-y-1">
              <h3 className="text-sm font-medium text-foreground">Retrieval preview</h3>
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                Test what saved Memory.md guidance would be loaded for a translation query.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
              <Field>
                <FieldLabel htmlFor="knowledge-memory-preview-locale">Target locale</FieldLabel>
                <Input
                  id="knowledge-memory-preview-locale"
                  value={previewTargetLocale}
                  onChange={(event) => setPreviewTargetLocale(event.target.value)}
                  placeholder="en-AU"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="knowledge-memory-preview-source">Source text</FieldLabel>
                <Textarea
                  id="knowledge-memory-preview-source"
                  value={previewSourceText}
                  onChange={(event) => setPreviewSourceText(event.target.value)}
                  className="min-h-20 resize-y border-border bg-background text-sm leading-6"
                  placeholder="Customize your color settings"
                />
              </Field>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">
                {currentEditorState.hasChanges
                  ? "Save changes before previewing updated memory."
                  : "Preview uses the saved markdown memory."}
              </p>
              <Button
                type="button"
                variant="secondary"
                disabled={!previewState.canPreview}
                onClick={() => previewKnowledgeMemory.mutate()}
              >
                <HugeiconsIcon icon={SearchIcon} strokeWidth={1.8} />
                {previewKnowledgeMemory.isPending ? "Previewing" : "Preview"}
              </Button>
            </div>

            {memoryPreview ? (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">
                    {memoryPreview.metrics.selectedMemoryCount} selected
                  </Badge>
                  <Badge variant="outline">
                    {memoryPreview.metrics.selectedMemoryChars}/
                    {memoryPreview.metrics.wholeMemoryChars} chars
                  </Badge>
                  <Badge variant="outline">
                    {formatMemoryReductionPercent(memoryPreview.metrics.reductionPercent)}
                  </Badge>
                  <Badge variant="outline">{memoryPreview.metrics.fallbackMode}</Badge>
                </div>

                <pre className="max-h-64 overflow-auto rounded-md border border-border bg-background p-3 text-sm leading-6 whitespace-pre-wrap text-foreground">
                  {memoryPreview.compactText || "(no memory selected)"}
                </pre>

                {memoryPreview.metrics.matchedHeadingPaths.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Matched headings</p>
                    <ul className="space-y-1 text-xs text-muted-foreground">
                      {memoryPreview.metrics.matchedHeadingPaths.map((headingPath) => (
                        <li key={headingPath}>{headingPath}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </form>
      )}
    </section>
  );
}
