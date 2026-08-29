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

import type { ContentEditorSegmentStatus } from "@/components/content-editor/shared/types";

export class ContentEditorSegmentDraft {
  segmentId: string;
  targetText: string;
  savedTargetText: string;
  status: ContentEditorSegmentStatus;

  constructor(segmentId: string, targetText: string, status: ContentEditorSegmentStatus) {
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

  setStatus(status: ContentEditorSegmentStatus) {
    this.status = status;
  }

  markSaved(targetText: string, status?: ContentEditorSegmentStatus) {
    this.targetText = targetText;
    this.savedTargetText = targetText;
    if (status) {
      this.status = status;
    }
  }

  applyServerTarget(targetText: string, status: ContentEditorSegmentStatus) {
    if (
      this.targetText === targetText &&
      this.savedTargetText === targetText &&
      this.status === status
    ) {
      return;
    }
    this.targetText = targetText;
    this.savedTargetText = targetText;
    this.status = status;
  }

  applyServerStatus(status: ContentEditorSegmentStatus) {
    if (this.status === status) {
      return;
    }
    this.status = status;
  }
}
