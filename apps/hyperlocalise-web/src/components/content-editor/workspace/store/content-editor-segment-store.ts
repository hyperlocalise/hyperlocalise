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
import { makeAutoObservable } from "mobx";

import type {
  ContentEditorSegmentComment,
  ContentEditorSegmentStatus,
} from "@/components/content-editor/shared/types";

import { isOpenIssueStatus } from "@/components/content-editor/queue/content-editor-queue-filter";

import { ContentEditorSegmentDraft } from "./content-editor-segment-draft";

export type ContentEditorSegmentWriteKind = "approve" | "draft";

export class ContentEditorSegmentStore {
  comments = new Map<string, ContentEditorSegmentComment[]>();
  openIssueCounts = new Map<string, number>();
  drafts = new Map<string, ContentEditorSegmentDraft>();
  /** Saves and approvals in flight, so a segment cannot be written twice at once. */
  pendingWrites = new Map<string, ContentEditorSegmentWriteKind>();

  targetLoadingSegmentIds = new Set<string>();
  commentsLoadingSegmentIds = new Set<string>();
  isPostingComment = false;
  isResolvingComment = false;
  resolvingCommentId: string | null = null;
  commentPostError: string | undefined;
  queueTargetLoadingSegmentIds = new Set<string>();
  /** Target requests that settled without a payload (error, retries exhausted, or disabled). */
  failedTargetSegmentIds = new Set<string>();

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true });
  }

  setQueueTargetLoadingSegmentIds(segmentIds: readonly string[]) {
    for (const segmentId of segmentIds) {
      this.failedTargetSegmentIds.delete(segmentId);
    }
    if (
      this.queueTargetLoadingSegmentIds.size === segmentIds.length &&
      segmentIds.every((segmentId) => this.queueTargetLoadingSegmentIds.has(segmentId))
    ) {
      return;
    }

    this.queueTargetLoadingSegmentIds = new Set(segmentIds);
  }

  markTargetLoadFailed(segmentId: string) {
    this.failedTargetSegmentIds.add(segmentId);
  }

  clearTargetLoadFailed(segmentId: string) {
    this.failedTargetSegmentIds.delete(segmentId);
  }

  clearFailedTargetSegmentIds() {
    this.failedTargetSegmentIds.clear();
  }

  get dirtySegmentIds(): ReadonlySet<string> {
    return new Set(
      [...this.drafts.values()].filter((draft) => draft.isDirty).map((draft) => draft.segmentId),
    );
  }

  get hasDirtySegments() {
    return [...this.drafts.values()].some((draft) => draft.isDirty);
  }

  hasOpenIssues(segmentId: string) {
    if ((this.openIssueCounts.get(segmentId) ?? 0) > 0) {
      return true;
    }

    return (
      this.comments
        .get(segmentId)
        ?.some((comment) => comment.type === "issue" && isOpenIssueStatus(comment.status)) ?? false
    );
  }

  clear() {
    this.targetLoadingSegmentIds.clear();
    this.commentsLoadingSegmentIds.clear();
    this.queueTargetLoadingSegmentIds.clear();
    this.clearSegmentData();
  }

  /** Drops the segment data a snapshot replaces. Loading flags belong to live queries and stay. */
  clearSegmentData() {
    this.comments.clear();
    this.openIssueCounts.clear();
    this.drafts.clear();
    this.failedTargetSegmentIds.clear();
  }

  /** Drops everything that belonged to the previous file or locale. */
  resetForFileScope() {
    this.clearSegmentData();
    this.pendingWrites.clear();
    this.isPostingComment = false;
    this.isResolvingComment = false;
    this.resolvingCommentId = null;
    this.commentPostError = undefined;
  }

  /** Removes one segment's data, e.g. when it leaves the loaded queue window. */
  evict(segmentId: string) {
    this.drafts.delete(segmentId);
    this.comments.delete(segmentId);
    this.openIssueCounts.delete(segmentId);
    this.failedTargetSegmentIds.delete(segmentId);
  }

  removeIfClean(segmentId: string) {
    if (this.drafts.get(segmentId)?.isDirty) {
      return false;
    }
    this.evict(segmentId);
    return true;
  }

  setComments(segmentId: string, comments: ContentEditorSegmentComment[]) {
    this.comments.set(segmentId, comments);
  }

  setOpenIssueCount(segmentId: string, openIssueCount: number) {
    this.openIssueCounts.set(segmentId, openIssueCount);
  }

  /** Returns false when the segment already has a write in flight. */
  beginWrite(segmentId: string, kind: ContentEditorSegmentWriteKind) {
    if (this.pendingWrites.has(segmentId)) {
      return false;
    }
    this.pendingWrites.set(segmentId, kind);
    return true;
  }

  endWrite(segmentId: string) {
    this.pendingWrites.delete(segmentId);
  }

  setTargetLoading(segmentId: string, loading: boolean) {
    if (loading) {
      this.targetLoadingSegmentIds.add(segmentId);
      this.failedTargetSegmentIds.delete(segmentId);
    } else {
      this.targetLoadingSegmentIds.delete(segmentId);
    }
  }

  setCommentsLoading(segmentId: string, loading: boolean) {
    if (loading) {
      this.commentsLoadingSegmentIds.add(segmentId);
    } else {
      this.commentsLoadingSegmentIds.delete(segmentId);
    }
  }

  beginPostComment() {
    this.commentPostError = undefined;
    this.isPostingComment = true;
  }

  endPostComment() {
    this.isPostingComment = false;
  }

  beginResolveComment(commentId: string) {
    this.commentPostError = undefined;
    this.resolvingCommentId = commentId;
    this.isResolvingComment = true;
  }

  endResolveComment() {
    this.isResolvingComment = false;
    this.resolvingCommentId = null;
  }

  failComment(message: string) {
    this.commentPostError = message;
  }

  setDraft(draft: ContentEditorSegmentDraft) {
    this.drafts.set(draft.segmentId, draft);
  }

  setTargetText(segmentId: string, value: string, existsInQueue: boolean) {
    const draft = this.drafts.get(segmentId);
    if (draft) {
      if (draft.targetText === value) {
        return;
      }
      draft.setTargetText(value);
    } else if (existsInQueue) {
      const nextDraft = new ContentEditorSegmentDraft(segmentId, "", "pending");
      nextDraft.setTargetText(value);
      this.drafts.set(segmentId, nextDraft);
    }
  }

  setStatus(segmentId: string, status: ContentEditorSegmentStatus, existsInQueue: boolean) {
    const draft = this.drafts.get(segmentId);
    if (draft) {
      draft.setStatus(status);
    } else if (existsInQueue) {
      this.drafts.set(segmentId, new ContentEditorSegmentDraft(segmentId, "", status));
    }
  }

  markSaved(
    segmentId: string,
    targetText: string,
    status: ContentEditorSegmentStatus | undefined,
    existsInQueue: boolean,
  ) {
    const draft = this.drafts.get(segmentId);
    if (draft) {
      draft.markSaved(targetText, status);
    } else if (existsInQueue) {
      this.drafts.set(
        segmentId,
        new ContentEditorSegmentDraft(segmentId, targetText, status ?? "needs_review"),
      );
    }
  }

  clearCommentError() {
    this.commentPostError = undefined;
  }
}
