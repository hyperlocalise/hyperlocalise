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
import { useMemo, useState } from "react";
import { HistoryIcon, RotateCcwIcon } from "lucide-react";
import { MultiFileDiff, type FileContents } from "@pierre/diffs/react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import { toast } from "sonner";

import type {
  KnowledgeMemoryRecord,
  KnowledgeMemoryRevision,
  KnowledgeMemoryRevisionListResponse,
} from "@/api/routes/knowledge-memory/knowledge-memory.schema";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { readApiError } from "@/lib/api-error";
import { apiClient } from "@/lib/api-client-instance";
import { cn } from "@/lib/primitives/cn";

import { parseKnowledgeMemoryPreconditionFailure } from "./knowledge-memory-editor-state";

const revisionPageSize = 20;

const knowledgeMemoryRevisionQueryKey = (organizationSlug: string) => [
  "knowledge-memory-revisions",
  organizationSlug,
];

export type KnowledgeMemoryConflict = {
  draftContent: string;
  draftSummary?: string;
  latestEtag: string;
  latestKnowledgeMemory: KnowledgeMemoryRecord;
};

export function createKnowledgeMemoryDiffFiles(input: {
  previousContent: string;
  selectedContent: string;
}): { oldFile: FileContents; newFile: FileContents } {
  return {
    oldFile: {
      name: "Memory.md",
      contents: input.previousContent,
      lang: "markdown",
    },
    newFile: {
      name: "Memory.md",
      contents: input.selectedContent,
      lang: "markdown",
    },
  };
}

function formatRevisionTimestamp(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function KnowledgeMemoryDiff({
  previousContent,
  selectedContent,
}: {
  previousContent: string;
  selectedContent: string;
}) {
  const { resolvedTheme } = useTheme();
  const files = createKnowledgeMemoryDiffFiles({ previousContent, selectedContent });
  const themeType = resolvedTheme === "light" ? "light" : "dark";

  return (
    <MultiFileDiff
      oldFile={files.oldFile}
      newFile={files.newFile}
      disableWorkerPool
      options={{
        diffStyle: "unified",
        overflow: "wrap",
        theme: { dark: "github-dark", light: "github-light" },
        themeType,
        lineDiffType: "word",
      }}
    />
  );
}

export function KnowledgeMemoryConflictView({
  conflict,
  isCommitting,
  onCommit,
  onReload,
}: {
  conflict: KnowledgeMemoryConflict;
  isCommitting: boolean;
  onCommit: () => void;
  onReload: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-border px-6 py-4">
        <h3 className="text-sm font-medium text-foreground">Newer changes are available</h3>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          Your draft is preserved. Compare it with version {conflict.latestKnowledgeMemory.version},
          then choose which content to keep.
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-auto bg-background">
        <KnowledgeMemoryDiff
          previousContent={conflict.latestKnowledgeMemory.content}
          selectedContent={conflict.draftContent}
        />
      </div>
      <DialogFooter className="border-t border-border px-6 py-4">
        <Button type="button" variant="outline" onClick={onReload}>
          Reload latest
        </Button>
        <Button type="button" disabled={isCommitting} onClick={onCommit}>
          {isCommitting ? "Committing" : "Commit draft as next version"}
        </Button>
      </DialogFooter>
    </div>
  );
}

export function KnowledgeMemoryHistoryDialog({
  organizationSlug,
  open,
  onOpenChange,
  canUpdateKnowledgeMemory,
  hasUnsavedChanges,
  currentEtag,
  currentRevisionId,
  conflict,
  isCommittingConflict,
  onCommitConflict,
  onReloadLatest,
  onPreconditionFailed,
  onRestored,
}: {
  organizationSlug: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canUpdateKnowledgeMemory: boolean;
  hasUnsavedChanges: boolean;
  currentEtag: string;
  currentRevisionId: string | null;
  conflict: KnowledgeMemoryConflict | null;
  isCommittingConflict: boolean;
  onCommitConflict: () => void;
  onReloadLatest: () => void;
  onPreconditionFailed: (
    revision: KnowledgeMemoryRevision,
    knowledgeMemory: KnowledgeMemoryRecord,
    etag: string,
  ) => void;
  onRestored: (knowledgeMemory: KnowledgeMemoryRecord, etag: string) => void;
}) {
  const queryClient = useQueryClient();
  const [selectedRevisionId, setSelectedRevisionId] = useState<string | null>(null);
  const [restoreRevision, setRestoreRevision] = useState<KnowledgeMemoryRevision | null>(null);

  const revisionsQuery = useInfiniteQuery({
    queryKey: knowledgeMemoryRevisionQueryKey(organizationSlug),
    initialPageParam: 0,
    enabled: open && conflict === null,
    queryFn: async ({ pageParam }) => {
      const response = await apiClient.api.orgs[":organizationSlug"][
        "knowledge-memory"
      ].revisions.$get({
        param: { organizationSlug },
        query: {
          limit: String(revisionPageSize),
          ...(pageParam > 0 ? { cursor: pageParam } : {}),
        },
      });

      if (!response.ok) {
        throw new Error(await readApiError(response, "Unable to load Knowledge Memory history"));
      }

      return (await response.json()) as KnowledgeMemoryRevisionListResponse;
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });

  const revisions = useMemo(
    () => revisionsQuery.data?.pages.flatMap((page) => page.knowledgeMemoryRevisions) ?? [],
    [revisionsQuery.data],
  );
  const effectiveRevisionId =
    selectedRevisionId && revisions.some((revision) => revision.revisionId === selectedRevisionId)
      ? selectedRevisionId
      : (revisions[0]?.revisionId ?? null);

  const revisionQuery = useQuery({
    queryKey: [...knowledgeMemoryRevisionQueryKey(organizationSlug), "detail", effectiveRevisionId],
    enabled: open && conflict === null && effectiveRevisionId !== null,
    queryFn: async () => {
      if (!effectiveRevisionId) {
        throw new Error("Knowledge Memory revision is required");
      }

      const response = await apiClient.api.orgs[":organizationSlug"]["knowledge-memory"].revisions[
        ":revisionId"
      ].$get({
        param: { organizationSlug, revisionId: effectiveRevisionId },
      });

      if (!response.ok) {
        throw new Error(await readApiError(response, "Unable to load Knowledge Memory revision"));
      }

      return response.json();
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async (revision: KnowledgeMemoryRevision) => {
      const response = await apiClient.api.orgs[":organizationSlug"]["knowledge-memory"].revisions[
        ":revisionId"
      ].restore.$post(
        {
          param: { organizationSlug, revisionId: revision.revisionId },
        },
        { headers: { "If-Match": currentEtag } },
      );

      if (response.status === 412) {
        const latestKnowledgeMemory = parseKnowledgeMemoryPreconditionFailure(
          await response.json(),
        );
        if (latestKnowledgeMemory) {
          return {
            kind: "stale" as const,
            knowledgeMemory: latestKnowledgeMemory,
            etag: response.headers.get("etag") ?? '"0"',
          };
        }
        throw new Error("Knowledge Memory changed after it was loaded");
      }

      if (!response.ok) {
        throw new Error(
          await readApiError(response, "Unable to restore Knowledge Memory revision"),
        );
      }

      const body = await response.json();
      return {
        kind: "restored" as const,
        knowledgeMemory: body.knowledgeMemory,
        etag: response.headers.get("etag") ?? '"0"',
      };
    },
    onSuccess: async (result, revision) => {
      setRestoreRevision(null);
      if (result.kind === "stale") {
        onPreconditionFailed(revision, result.knowledgeMemory, result.etag);
        return;
      }

      onRestored(result.knowledgeMemory, result.etag);
      setSelectedRevisionId(result.knowledgeMemory.revisionId);
      await queryClient.invalidateQueries({
        queryKey: knowledgeMemoryRevisionQueryKey(organizationSlug),
      });
      toast.success(`Restored as version ${result.knowledgeMemory.version}`);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const selectedDetail = revisionQuery.data?.knowledgeMemoryRevision;
  const previousDetail = revisionQuery.data?.previousKnowledgeMemoryRevision;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex h-[min(85dvh,52rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-6xl">
          <DialogHeader className="border-b border-border px-6 py-5 pe-14">
            <DialogTitle className="flex items-center gap-2">
              <HistoryIcon className="size-4" />
              Memory history
            </DialogTitle>
            <DialogDescription>
              Review committed versions, compare changes, or restore an earlier Memory.md.
            </DialogDescription>
          </DialogHeader>

          {conflict ? (
            <KnowledgeMemoryConflictView
              conflict={conflict}
              isCommitting={isCommittingConflict}
              onCommit={onCommitConflict}
              onReload={onReloadLatest}
            />
          ) : (
            <div className="grid min-h-0 flex-1 grid-rows-[minmax(10rem,auto)_1fr] md:grid-cols-[16rem_1fr] md:grid-rows-1">
              <aside className="min-h-0 overflow-y-auto border-b border-border p-3 md:border-e md:border-b-0">
                {revisionsQuery.isLoading ? (
                  <div className="flex h-32 items-center justify-center text-muted-foreground">
                    <Spinner />
                  </div>
                ) : revisions.length === 0 ? (
                  <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                    No committed versions yet.
                  </p>
                ) : (
                  <div className="space-y-1">
                    {revisions.map((revision) => (
                      <button
                        key={revision.revisionId}
                        type="button"
                        aria-pressed={effectiveRevisionId === revision.revisionId}
                        className={cn(
                          "w-full rounded-md px-3 py-2.5 text-start transition-colors hover:bg-muted",
                          effectiveRevisionId === revision.revisionId && "bg-muted",
                        )}
                        onClick={() => setSelectedRevisionId(revision.revisionId)}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium text-foreground">
                            Version {revision.version}
                          </span>
                          {revision.isCurrent ? <Badge variant="outline">Current</Badge> : null}
                        </span>
                        <span className="mt-1 block truncate text-xs text-muted-foreground">
                          {revision.summary}
                        </span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {revision.createdByName ?? "Unknown author"} -{" "}
                          {formatRevisionTimestamp(revision.createdAt)}
                        </span>
                      </button>
                    ))}
                    {revisionsQuery.hasNextPage ? (
                      <Button
                        type="button"
                        variant="ghost"
                        className="mt-2 w-full"
                        disabled={revisionsQuery.isFetchingNextPage}
                        onClick={() => revisionsQuery.fetchNextPage()}
                      >
                        {revisionsQuery.isFetchingNextPage ? "Loading" : "Load older versions"}
                      </Button>
                    ) : null}
                  </div>
                )}
              </aside>

              <div className="flex min-h-0 flex-col">
                {revisionQuery.isLoading ? (
                  <div className="flex flex-1 items-center justify-center text-muted-foreground">
                    <Spinner />
                  </div>
                ) : selectedDetail ? (
                  <>
                    <div className="flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">
                          Version {selectedDetail.version}: {selectedDetail.summary}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Compared with{" "}
                          {previousDetail
                            ? `version ${previousDetail.version}`
                            : "an empty document"}
                        </p>
                      </div>
                      {canUpdateKnowledgeMemory &&
                      selectedDetail.revisionId !== currentRevisionId ? (
                        <Button
                          type="button"
                          variant="outline"
                          disabled={hasUnsavedChanges}
                          title={
                            hasUnsavedChanges
                              ? "Commit or discard your draft before restoring a version"
                              : undefined
                          }
                          onClick={() => setRestoreRevision(selectedDetail)}
                        >
                          <RotateCcwIcon className="size-4" />
                          Restore
                        </Button>
                      ) : null}
                    </div>
                    <div className="min-h-0 flex-1 overflow-auto bg-background">
                      <KnowledgeMemoryDiff
                        previousContent={previousDetail?.content ?? ""}
                        selectedContent={selectedDetail.content}
                      />
                    </div>
                  </>
                ) : (
                  <div className="flex flex-1 items-center justify-center px-6 text-sm text-muted-foreground">
                    Select a committed version to inspect its changes.
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={restoreRevision !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setRestoreRevision(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore version {restoreRevision?.version ?? ""}</AlertDialogTitle>
            <AlertDialogDescription>
              This creates a new current version with the selected content. Existing history remains
              unchanged.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={restoreMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!restoreRevision || restoreMutation.isPending}
              onClick={() => {
                if (restoreRevision) {
                  restoreMutation.mutate(restoreRevision);
                }
              }}
            >
              {restoreMutation.isPending ? "Restoring" : "Restore version"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
