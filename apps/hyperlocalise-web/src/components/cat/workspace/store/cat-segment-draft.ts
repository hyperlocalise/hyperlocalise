import { makeAutoObservable } from "mobx";

import type { CatSegmentStatus } from "@/components/cat/shared/types";

export class CatSegmentDraft {
  segmentId: string;
  targetText: string;
  savedTargetText: string;
  status: CatSegmentStatus;

  constructor(segmentId: string, targetText: string, status: CatSegmentStatus) {
    this.segmentId = segmentId;
    this.targetText = targetText;
    this.savedTargetText = targetText;
    this.status = status;
    makeAutoObservable(this, {}, { autoBind: true });
  }

  get isDirty() {
    return this.targetText !== this.savedTargetText;
  }

  setTargetText(value: string) {
    this.targetText = value;
  }

  setStatus(status: CatSegmentStatus) {
    this.status = status;
  }

  markSaved(targetText: string, status?: CatSegmentStatus) {
    this.targetText = targetText;
    this.savedTargetText = targetText;
    if (status) {
      this.status = status;
    }
  }

  applyServerTarget(targetText: string, status: CatSegmentStatus) {
    this.targetText = targetText;
    this.savedTargetText = targetText;
    this.status = status;
  }

  applyServerStatus(status: CatSegmentStatus) {
    this.status = status;
  }
}
