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

/** Progress of the bulk action (approve, skip, hide, lock) running on checked rows. */
export class ContentEditorBulkActionStore {
  isPending = false;
  completedCount = 0;
  totalCount = 0;

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true });
  }

  begin(totalCount = 0) {
    this.isPending = true;
    this.completedCount = 0;
    this.totalCount = totalCount;
  }

  recordCompleted() {
    this.completedCount += 1;
  }

  end() {
    this.isPending = false;
  }

  resetForFileScope() {
    this.isPending = false;
    this.completedCount = 0;
    this.totalCount = 0;
  }
}
