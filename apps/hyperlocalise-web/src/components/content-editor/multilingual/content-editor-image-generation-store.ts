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
import { makeAutoObservable, observable, runInAction } from "mobx";

export type ContentEditorImageGenerationState =
  | { status: "running"; startedAt: number }
  | { status: "failed" };

export function contentEditorImageGenerationKey(segmentId: string, locale: string) {
  return JSON.stringify([segmentId, locale]);
}

/**
 * Per-locale image generation progress for the multilingual gallery.
 * Lives on the workspace so switching File ↔ Multilingual does not drop in-flight work.
 */
export class ContentEditorImageGenerationStore {
  readonly states = observable.map<string, ContentEditorImageGenerationState>();

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true });
  }

  get(segmentId: string, locale: string) {
    return this.states.get(contentEditorImageGenerationKey(segmentId, locale));
  }

  get runningCount() {
    let count = 0;
    for (const state of this.states.values()) {
      if (state.status === "running") {
        count += 1;
      }
    }
    return count;
  }

  start(segmentId: string, locale: string) {
    const current = this.get(segmentId, locale);
    if (current?.status === "running") {
      return false;
    }
    this.states.set(contentEditorImageGenerationKey(segmentId, locale), {
      status: "running",
      startedAt: Date.now(),
    });
    return true;
  }

  succeed(segmentId: string, locale: string) {
    const key = contentEditorImageGenerationKey(segmentId, locale);
    if (this.states.get(key)?.status === "running") {
      this.states.delete(key);
    }
  }

  fail(segmentId: string, locale: string) {
    const key = contentEditorImageGenerationKey(segmentId, locale);
    if (this.states.get(key)?.status === "running") {
      this.states.set(key, { status: "failed" });
    }
  }

  clear() {
    this.states.clear();
  }

  async run(segmentId: string, locale: string, work: () => Promise<void>) {
    if (!this.start(segmentId, locale)) {
      return;
    }
    try {
      await work();
      runInAction(() => this.succeed(segmentId, locale));
    } catch {
      runInAction(() => this.fail(segmentId, locale));
    }
  }
}
