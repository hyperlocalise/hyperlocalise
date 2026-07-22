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

  applyServerStatus(status: CatSegmentStatus) {
    if (this.status === status) {
      return;
    }
    this.status = status;
  }
}
