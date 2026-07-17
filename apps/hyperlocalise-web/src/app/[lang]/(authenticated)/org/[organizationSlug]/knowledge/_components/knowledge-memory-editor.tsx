"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FloppyDiskIcon, SearchIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { HistoryIcon } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import type {
  KnowledgeMemoryPreviewResponse,
  KnowledgeMemoryRecord,
} from "@/api/routes/knowledge-memory/knowledge-memory.schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { readApiError } from "@/lib/api-error";
import { apiClient } from "@/lib/api-client-instance";
import { KNOWLEDGE_MEMORY_SUMMARY_MAX_LENGTH } from "@/lib/knowledge-memory/knowledge-memory.shared";

import {
  getKnowledgeMemoryEditorState,
  shouldApplyKnowledgeMemoryRefresh,
} from "./knowledge-memory-editor-state";
import {
  KnowledgeMemoryHistoryDialog,
  type KnowledgeMemoryConflict,
} from "./knowledge-memory-history-dialog";
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
type LoadedKnowledgeMemory = {
  knowledgeMemory: KnowledgeMemoryRecord;
  etag: string;
};

function parsePreconditionFailure(body: unknown): KnowledgeMemoryRecord | null {
  if (
    typeof body !== "object" ||
    body === null ||
    !("details" in body) ||
    typeof body.details !== "object" ||
    body.details === null ||
    !("knowledgeMemory" in body.details)
  ) {
    return null;
  }

  return body.details.knowledgeMemory as KnowledgeMemoryRecord;
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
  const [savedKnowledgeMemory, setSavedKnowledgeMemory] = useState<KnowledgeMemoryRecord | null>(
    null,
  );
  const [summary, setSummary] = useState("");
  const [savedEtag, setSavedEtag] = useState('"0"');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [conflict, setConflict] = useState<KnowledgeMemoryConflict | null>(null);
  const [previewTargetLocale, setPreviewTargetLocale] = useState("");
  const [previewSourceText, setPreviewSourceText] = useState("");
  const [memoryPreview, setMemoryPreview] = useState<MemoryPreview | null>(null);
  const previewGeneration = useRef(0);

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
      return {
        knowledgeMemory: body.knowledgeMemory,
        etag: response.headers.get("etag") ?? '"0"',
      } satisfies LoadedKnowledgeMemory;
    },
  });

  useEffect(() => {
    if (
      !knowledgeMemoryQuery.data ||
      !shouldApplyKnowledgeMemoryRefresh({ content, savedContent })
    ) {
      return;
    }

    setContent(knowledgeMemoryQuery.data.knowledgeMemory.content);
    setSavedContent(knowledgeMemoryQuery.data.knowledgeMemory.content);
    setSavedKnowledgeMemory(knowledgeMemoryQuery.data.knowledgeMemory);
    setSavedEtag(knowledgeMemoryQuery.data.etag);
    setSummary("");
    setConflict(null);
    previewGeneration.current += 1;
    setMemoryPreview(null);
  }, [content, knowledgeMemoryQuery.data, savedContent]);

  const applyLoadedKnowledgeMemory = useCallback(
    (knowledgeMemory: KnowledgeMemoryRecord, etag: string) => {
      setContent(knowledgeMemory.content);
      setSavedContent(knowledgeMemory.content);
      setSavedKnowledgeMemory(knowledgeMemory);
      setSavedEtag(etag);
      setSummary("");
      setConflict(null);
      previewGeneration.current += 1;
      setMemoryPreview(null);
      queryClient.setQueryData<LoadedKnowledgeMemory>(knowledgeMemoryQueryKey(organizationSlug), {
        knowledgeMemory,
        etag,
      });
    },
    [organizationSlug, queryClient],
  );

  const saveKnowledgeMemory = useMutation({
    mutationFn: async (input: { content: string; summary?: string; expectedEtag: string }) => {
      const response = await apiClient.api.orgs[":organizationSlug"]["knowledge-memory"].$put(
        {
          param: { organizationSlug },
          json: { content: input.content, summary: input.summary },
        },
        { headers: { "If-Match": input.expectedEtag } },
      );

      if (response.status === 412) {
        const latestKnowledgeMemory = parsePreconditionFailure(await response.json());
        if (latestKnowledgeMemory) {
          return {
            kind: "stale" as const,
            latestKnowledgeMemory,
            latestEtag: response.headers.get("etag") ?? '"0"',
          };
        }
        throw new Error("Knowledge Memory changed after it was loaded");
      }

      if (!response.ok) {
        throw new Error(await readApiError(response, "Unable to commit Knowledge Memory"));
      }

      const body = await response.json();
      return {
        kind: "committed" as const,
        knowledgeMemory: body.knowledgeMemory,
        etag: response.headers.get("etag") ?? '"0"',
      };
    },
    onSuccess: (result, input) => {
      if (result.kind === "stale") {
        setConflict({
          draftContent: input.content,
          latestEtag: result.latestEtag,
          latestKnowledgeMemory: result.latestKnowledgeMemory,
        });
        setHistoryOpen(true);
        return;
      }

      applyLoadedKnowledgeMemory(result.knowledgeMemory, result.etag);
      toast.success(`Committed version ${result.knowledgeMemory.version}`);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const previewKnowledgeMemory = useMutation({
    mutationFn: async () => {
      const generation = previewGeneration.current;
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
      return { generation, preview: body.memoryPreview };
    },
    onSuccess: ({ generation, preview }) => {
      if (generation === previewGeneration.current) {
        setMemoryPreview(preview);
      }
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
        <div className="text-end text-xs text-muted-foreground">
          <p>Last updated {formatUpdatedAt(savedKnowledgeMemory?.updatedAt ?? null)}</p>
          {savedKnowledgeMemory?.version ? (
            <p className="mt-1">Version {savedKnowledgeMemory.version}</p>
          ) : null}
        </div>
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
              saveKnowledgeMemory.mutate({
                content,
                summary: summary.trim() || undefined,
                expectedEtag: savedEtag,
              });
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
              onChange={(event) => {
                setContent(event.target.value);
                setConflict(null);
              }}
              className="min-h-64 resize-y border-border bg-background font-mono text-sm leading-6"
              placeholder="Example: ## Tone&#10;- Keep product copy practical and direct.&#10;- Keep Hyperlocalise untranslated."
            />
            {currentEditorState.isOverLimit ? (
              <FieldError>
                Knowledge memory must be {currentEditorState.characterLimit} characters or less.
              </FieldError>
            ) : null}
          </Field>

          {canUpdateKnowledgeMemory ? (
            <Field>
              <FieldLabel htmlFor="knowledge-memory-summary">Version note (optional)</FieldLabel>
              <Input
                id="knowledge-memory-summary"
                value={summary}
                maxLength={KNOWLEDGE_MEMORY_SUMMARY_MAX_LENGTH}
                onChange={(event) => setSummary(event.target.value)}
                placeholder="Explain what changed"
              />
            </Field>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              {currentEditorState.characterCount}/{currentEditorState.characterLimit} characters
            </p>
            <div className="flex items-center justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setHistoryOpen(true)}>
                <HistoryIcon className="size-4" />
                History
              </Button>
              {canUpdateKnowledgeMemory ? (
                <Button type="submit" disabled={!currentEditorState.canSave}>
                  <HugeiconsIcon icon={FloppyDiskIcon} strokeWidth={1.8} />
                  {saveKnowledgeMemory.isPending ? "Committing" : "Commit changes"}
                </Button>
              ) : null}
            </div>
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
                  onChange={(event) => {
                    setPreviewTargetLocale(event.target.value);
                    previewGeneration.current += 1;
                    setMemoryPreview(null);
                  }}
                  placeholder="en-AU"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="knowledge-memory-preview-source">Source text</FieldLabel>
                <Textarea
                  id="knowledge-memory-preview-source"
                  value={previewSourceText}
                  onChange={(event) => {
                    setPreviewSourceText(event.target.value);
                    previewGeneration.current += 1;
                    setMemoryPreview(null);
                  }}
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

      <KnowledgeMemoryHistoryDialog
        organizationSlug={organizationSlug}
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        canUpdateKnowledgeMemory={canUpdateKnowledgeMemory}
        hasUnsavedChanges={currentEditorState.hasChanges}
        currentEtag={savedEtag}
        currentRevisionId={savedKnowledgeMemory?.revisionId ?? null}
        conflict={conflict}
        isCommittingConflict={saveKnowledgeMemory.isPending}
        onCommitConflict={() => {
          if (!conflict) {
            return;
          }
          saveKnowledgeMemory.mutate({
            content: conflict.draftContent,
            summary: summary.trim() || undefined,
            expectedEtag: conflict.latestEtag,
          });
        }}
        onReloadLatest={() => {
          if (!conflict) {
            return;
          }
          applyLoadedKnowledgeMemory(conflict.latestKnowledgeMemory, conflict.latestEtag);
          setHistoryOpen(false);
        }}
        onPreconditionFailed={(knowledgeMemory, etag) => {
          setConflict({
            draftContent: content,
            latestEtag: etag,
            latestKnowledgeMemory: knowledgeMemory,
          });
        }}
        onRestored={(knowledgeMemory, etag) => {
          applyLoadedKnowledgeMemory(knowledgeMemory, etag);
        }}
      />
    </section>
  );
}
