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

import { ContentEditorSegmentDraft } from "./content-editor-segment-draft";

export class ContentEditorSegmentStore {
  comments = new Map<string, ContentEditorSegmentComment[]>();
  openIssueCounts = new Map<string, number>();
  drafts = new Map<string, ContentEditorSegmentDraft>();

  isTargetLoading = false;
  isCommentsLoading = false;
  isPostingComment = false;
  isResolvingComment = false;
  resolvingCommentId: string | null = null;
  commentPostError: string | undefined;
  queueTargetLoadingSegmentIds = new Set<string>();

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true });
  }

  setQueueTargetLoadingSegmentIds(segmentIds: readonly string[]) {
    if (
      this.queueTargetLoadingSegmentIds.size === segmentIds.length &&
      segmentIds.every((segmentId) => this.queueTargetLoadingSegmentIds.has(segmentId))
    ) {
      return;
    }

    this.queueTargetLoadingSegmentIds = new Set(segmentIds);
  }

  get dirtySegmentIds(): ReadonlySet<string> {
    return new Set(
      [...this.drafts.values()].filter((draft) => draft.isDirty).map((draft) => draft.segmentId),
    );
  }

  get hasDirtySegments() {
    return [...this.drafts.values()].some((draft) => draft.isDirty);
  }

  clear() {
    this.comments.clear();
    this.openIssueCounts.clear();
    this.drafts.clear();
    this.queueTargetLoadingSegmentIds.clear();
  }

  removeIfClean(segmentId: string) {
    const draft = this.drafts.get(segmentId);
    if (!draft?.isDirty) {
      this.drafts.delete(segmentId);
      this.comments.delete(segmentId);
      this.openIssueCounts.delete(segmentId);
      return true;
    }
    return false;
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
