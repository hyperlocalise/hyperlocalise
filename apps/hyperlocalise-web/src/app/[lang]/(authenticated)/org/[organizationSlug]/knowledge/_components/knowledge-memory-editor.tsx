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
import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import type { KnowledgeMemoryRecord } from "@/api/routes/knowledge-memory/knowledge-memory.schema";
import { readApiError } from "@/lib/api-error";
import { apiClient } from "@/lib/api-client-instance";

import {
  getKnowledgeMemoryEditorState,
  parseKnowledgeMemoryPreconditionFailure,
  shouldApplyKnowledgeMemoryRefresh,
} from "./knowledge-memory-editor-state";
import { KnowledgeMemoryEditorView } from "./knowledge-memory-editor-view";
import {
  KnowledgeMemoryHistoryDialog,
  type KnowledgeMemoryConflict,
} from "./knowledge-memory-history-dialog";
import { knowledgeMemoryQueryKey, type LoadedKnowledgeMemory } from "./knowledge-memory-query";

export function KnowledgeMemoryEditor({
  organizationSlug,
  canUpdateKnowledgeMemory,
  initialDraftContent,
}: {
  organizationSlug: string;
  canUpdateKnowledgeMemory: boolean;
  /** Applied once after the saved memory loads, when the draft differs. */
  initialDraftContent?: string;
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
  const appliedInitialDraft = useRef(false);

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

    const loadedContent = knowledgeMemoryQuery.data.knowledgeMemory.content;
    setSavedContent(loadedContent);
    setSavedKnowledgeMemory(knowledgeMemoryQuery.data.knowledgeMemory);
    setSavedEtag(knowledgeMemoryQuery.data.etag);
    setSummary("");
    setConflict(null);

    if (
      !appliedInitialDraft.current &&
      typeof initialDraftContent === "string" &&
      initialDraftContent !== loadedContent
    ) {
      appliedInitialDraft.current = true;
      setContent(initialDraftContent);
      return;
    }

    setContent(loadedContent);
  }, [content, initialDraftContent, knowledgeMemoryQuery.data, savedContent]);

  const applyLoadedKnowledgeMemory = useCallback(
    (knowledgeMemory: KnowledgeMemoryRecord, etag: string) => {
      setContent(knowledgeMemory.content);
      setSavedContent(knowledgeMemory.content);
      setSavedKnowledgeMemory(knowledgeMemory);
      setSavedEtag(etag);
      setSummary("");
      setConflict(null);
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
        const latestKnowledgeMemory = parseKnowledgeMemoryPreconditionFailure(
          await response.json(),
        );
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
          draftSummary: input.summary,
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

  const currentEditorState = getKnowledgeMemoryEditorState({
    content,
    savedContent,
    canUpdateKnowledgeMemory,
    isSaving: saveKnowledgeMemory.isPending,
  });

  return (
    <>
      <KnowledgeMemoryEditorView
        content={content}
        onContentChange={(value) => {
          setContent(value);
          setConflict(null);
        }}
        summary={summary}
        onSummaryChange={setSummary}
        savedKnowledgeMemory={savedKnowledgeMemory}
        characterCount={currentEditorState.characterCount}
        characterLimit={currentEditorState.characterLimit}
        isOverLimit={currentEditorState.isOverLimit}
        hasChanges={currentEditorState.hasChanges}
        canSave={currentEditorState.canSave}
        canUpdateKnowledgeMemory={canUpdateKnowledgeMemory}
        isLoading={knowledgeMemoryQuery.isLoading}
        isSaving={saveKnowledgeMemory.isPending}
        onOpenHistory={() => setHistoryOpen(true)}
        onSubmit={() => {
          saveKnowledgeMemory.mutate({
            content,
            summary: summary.trim() || undefined,
            expectedEtag: savedEtag,
          });
        }}
      />

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
            summary: conflict.draftSummary,
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
        onPreconditionFailed={(revision, knowledgeMemory, etag) => {
          setConflict({
            draftContent: revision.content,
            draftSummary: `Restored version ${revision.version}`,
            latestEtag: etag,
            latestKnowledgeMemory: knowledgeMemory,
          });
        }}
        onRestored={(knowledgeMemory, etag) => {
          applyLoadedKnowledgeMemory(knowledgeMemory, etag);
        }}
      />
    </>
  );
}
