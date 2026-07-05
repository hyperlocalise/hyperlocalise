import { makeAutoObservable } from "mobx";

import type { CatSegmentComment, CatSegmentStatus } from "@/components/cat/shared/types";

import { CatSegmentDraft } from "./cat-segment-draft";

export class CatSegmentStore {
  comments = new Map<string, CatSegmentComment[]>();
  drafts = new Map<string, CatSegmentDraft>();

  isTargetLoading = false;
  isCommentsLoading = false;
  isPostingComment = false;
  isResolvingComment = false;
  resolvingCommentId: string | null = null;
  commentPostError: string | undefined;

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true });
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
    this.drafts.clear();
  }

  removeIfClean(segmentId: string) {
    const draft = this.drafts.get(segmentId);
    if (!draft?.isDirty) {
      this.drafts.delete(segmentId);
      this.comments.delete(segmentId);
      return true;
    }
    return false;
  }

  setTargetText(segmentId: string, value: string, existsInQueue: boolean) {
    const draft = this.drafts.get(segmentId);
    if (draft) {
      draft.setTargetText(value);
    } else if (existsInQueue) {
      const nextDraft = new CatSegmentDraft(segmentId, "", "pending");
      nextDraft.setTargetText(value);
      this.drafts.set(segmentId, nextDraft);
    }
  }

  setStatus(segmentId: string, status: CatSegmentStatus, existsInQueue: boolean) {
    const draft = this.drafts.get(segmentId);
    if (draft) {
      draft.setStatus(status);
    } else if (existsInQueue) {
      this.drafts.set(segmentId, new CatSegmentDraft(segmentId, "", status));
    }
  }

  markSaved(
    segmentId: string,
    targetText: string,
    status: CatSegmentStatus | undefined,
    existsInQueue: boolean,
  ) {
    const draft = this.drafts.get(segmentId);
    if (draft) {
      draft.markSaved(targetText, status);
    } else if (existsInQueue) {
      this.drafts.set(
        segmentId,
        new CatSegmentDraft(segmentId, targetText, status ?? "needs_review"),
      );
    }
  }

  clearCommentError() {
    this.commentPostError = undefined;
  }
}
