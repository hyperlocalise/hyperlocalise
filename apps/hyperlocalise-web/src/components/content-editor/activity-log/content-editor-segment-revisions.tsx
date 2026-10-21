"use client";
/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License 1.1,
 * use of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { useState } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { FormattedMessage, useIntl, type MessageDescriptor } from "react-intl";
import { toast } from "sonner";

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
import { GoSvcClientError, type GoSvcClient } from "@/lib/go-svc/go-svc-client";
import type { CatSegmentRevision } from "@/lib/go-svc/go-svc-cat-revisions.types";
import { cn } from "@/lib/primitives/cn";

import { diffRevisionText } from "./content-editor-revision-diff";
import { contentEditorSegmentRevisionsMessages as messages } from "./content-editor-segment-revisions.messages";

const REVISIONS_PAGE_SIZE = 20;
const UNDO_OPERATION_PREFIX = "undo:";

type RevisionsScope = {
  client: GoSvcClient;
  organizationSlug: string;
  projectId: string;
};

export function segmentRevisionsQueryKey(input: {
  organizationSlug: string;
  projectId: string;
  segmentId: string;
  sourcePath: string;
  targetLocale: string;
}) {
  return [
    "content-editor-segment-revisions",
    input.organizationSlug,
    input.projectId,
    input.segmentId,
    input.sourcePath,
    input.targetLocale,
  ] as const;
}

/** Who wrote a version, as shown on its badge. */
export function revisionAuthorMessage(revision: {
  actor: Pick<CatSegmentRevision["actor"], "kind">;
  provenance: CatSegmentRevision["provenance"];
}) {
  if (revision.actor.kind === "agent" || revision.provenance === "agent") return messages.byAi;
  if (revision.actor.kind === "user") return messages.byHuman;
  if (revision.actor.kind === "api_key") return messages.byApiKey;
  if (revision.provenance === "translation_job") return messages.byJob;
  if (revision.provenance === "import") return messages.byImport;
  return messages.bySystem;
}

function errorCode(error: unknown) {
  return error instanceof GoSvcClientError ? error.code : null;
}

export function SegmentRevisions({
  scope,
  segmentId,
  sourcePath,
  targetLocale,
}: {
  scope: RevisionsScope;
  segmentId: string;
  sourcePath: string;
  targetLocale: string;
}) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const [pendingUndo, setPendingUndo] = useState<string | null>(null);
  const queryKey = segmentRevisionsQueryKey({
    organizationSlug: scope.organizationSlug,
    projectId: scope.projectId,
    segmentId,
    sourcePath,
    targetLocale,
  });
  const revisions = useInfiniteQuery({
    queryKey,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      scope.client.cat.segmentRevisions(
        scope.organizationSlug,
        scope.projectId,
        segmentId,
        { sourcePath, targetLocale, limit: REVISIONS_PAGE_SIZE, cursor: pageParam },
        { signal },
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });

  const refreshEditor = async () => {
    const project = [scope.organizationSlug, scope.projectId];
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["content-editor-segment-revisions", ...project] }),
      queryClient.invalidateQueries({ queryKey: ["content-editor-activity-logs", ...project] }),
      queryClient.invalidateQueries({
        queryKey: ["project-file-content-editor-queue", ...project],
      }),
      queryClient.invalidateQueries({
        queryKey: ["project-file-content-editor-segment-target", ...project],
      }),
    ]);
  };

  const showError = (fallback: MessageDescriptor, error: unknown) => {
    const code = errorCode(error);
    const message =
      code === "cat_revision_conflict"
        ? messages.restoreConflict
        : code === "cat_segment_locked"
          ? messages.restoreLocked
          : code === "cat_operation_too_large"
            ? messages.undoTooLarge
            : fallback;
    toast.error(intl.formatMessage(message));
  };

  const items = revisions.data?.pages.flatMap((page) => page.revisions) ?? [];
  const currentId = items.find((revision) => revision.isCurrent)?.id;

  const restore = useMutation({
    mutationFn: (revisionId: string) =>
      scope.client.cat.restoreSegmentRevision(
        scope.organizationSlug,
        scope.projectId,
        segmentId,
        revisionId,
        { sourcePath, targetLocale, expectedCurrentRevisionId: currentId },
      ),
    onSuccess: () => toast.success(intl.formatMessage(messages.restored)),
    onError: (error) => showError(messages.restoreFailed, error),
    onSettled: refreshEditor,
  });

  const undo = useMutation({
    mutationFn: (operationId: string) =>
      scope.client.cat.undoOperation(scope.organizationSlug, scope.projectId, operationId),
    onSuccess: (result) => {
      const skipped = result.skippedChangedCount + result.skippedLockedCount;
      toast.success(intl.formatMessage(messages.undoDone, { count: result.restoredCount }), {
        description:
          skipped > 0 ? intl.formatMessage(messages.undoSkipped, { count: skipped }) : undefined,
      });
    },
    onError: (error) => showError(messages.undoFailed, error),
    onSettled: refreshEditor,
  });

  const busy = restore.isPending || undo.isPending;

  return (
    <section className="flex flex-col gap-3 border-b pb-4">
      <h3 className="text-sm font-medium">
        <FormattedMessage {...messages.title} />
      </h3>
      {revisions.isPending ? (
        <p className="text-xs text-muted-foreground" role="status">
          <FormattedMessage {...messages.loading} />
        </p>
      ) : revisions.isError ? (
        <div role="alert" className="flex items-center gap-2 text-xs">
          <FormattedMessage {...messages.loadError} />
          <Button size="sm" variant="outline" onClick={() => void revisions.refetch()}>
            <FormattedMessage {...messages.retry} />
          </Button>
        </div>
      ) : items.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          <FormattedMessage {...messages.empty} />
        </p>
      ) : (
        <ol className="flex flex-col gap-3">
          {items.map((revision, index) => {
            const previous = items[index + 1];
            return (
              <li key={revision.id} className="rounded-md border p-3">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge variant={revision.actor.kind === "user" ? "secondary" : "outline"}>
                    <FormattedMessage {...revisionAuthorMessage(revision)} />
                  </Badge>
                  <span className="font-medium">{revision.actor.displayName}</span>
                  <span className="text-muted-foreground">
                    {intl.formatDate(revision.createdAt)} · {intl.formatTime(revision.createdAt)}
                  </span>
                  <span className="text-muted-foreground">{revision.status}</span>
                  {revision.isCurrent ? (
                    <Badge variant="success">
                      <FormattedMessage {...messages.current} />
                    </Badge>
                  ) : null}
                </div>
                {revision.restoredFromRevisionId ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    <FormattedMessage {...messages.restoredLabel} />
                  </p>
                ) : revision.operationId?.startsWith(UNDO_OPERATION_PREFIX) ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    <FormattedMessage {...messages.undoneLabel} />
                  </p>
                ) : null}
                <RevisionText text={revision.text} previousText={previous?.text} />
                <div className="mt-2 flex flex-wrap gap-2">
                  {!revision.isCurrent ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => restore.mutate(revision.id)}
                    >
                      {restore.isPending && restore.variables === revision.id ? (
                        <FormattedMessage {...messages.restoring} />
                      ) : (
                        <FormattedMessage {...messages.restore} />
                      )}
                    </Button>
                  ) : null}
                  {revision.operationId ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => setPendingUndo(revision.operationId)}
                    >
                      <FormattedMessage {...messages.undo} />
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {revisions.hasNextPage ? (
        <Button
          size="sm"
          variant="outline"
          disabled={revisions.isFetchingNextPage}
          onClick={() => void revisions.fetchNextPage()}
        >
          <FormattedMessage {...messages.loadMore} />
        </Button>
      ) : null}
      <AlertDialog
        open={pendingUndo !== null}
        onOpenChange={(open) => {
          if (!open) setPendingUndo(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              <FormattedMessage {...messages.undoTitle} />
            </AlertDialogTitle>
            <AlertDialogDescription>
              <FormattedMessage {...messages.undoDescription} />
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              <FormattedMessage {...messages.undoCancel} />
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingUndo) undo.mutate(pendingUndo);
                setPendingUndo(null);
              }}
            >
              <FormattedMessage {...messages.undoConfirm} />
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

/** A version's text, marked against the version before it when that one is loaded. */
function RevisionText({ text, previousText }: { text: string; previousText?: string }) {
  if (!text) {
    return (
      <p className="mt-2 text-sm text-muted-foreground italic">
        <FormattedMessage {...messages.emptyText} />
      </p>
    );
  }
  if (previousText === undefined) {
    return <p className="mt-2 text-sm break-words whitespace-pre-wrap">{text}</p>;
  }
  return (
    <p className="mt-2 text-sm break-words whitespace-pre-wrap">
      {diffRevisionText(previousText, text).map((part, index) => (
        <span
          key={index}
          className={cn(
            part.kind === "added" && "bg-success/20",
            part.kind === "removed" && "bg-destructive/10 text-destructive line-through",
          )}
        >
          {part.text}
        </span>
      ))}
    </p>
  );
}
