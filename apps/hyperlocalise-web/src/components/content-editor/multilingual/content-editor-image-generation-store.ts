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

export type ContentEditorImageGenerationStatus = "running" | "failed";

export type ContentEditorImageGenerationWork = (signal: AbortSignal) => Promise<void>;

function contentEditorImageGenerationKey(segmentId: string, locale: string) {
  return JSON.stringify([segmentId, locale]);
}

/**
 * One generation attempt for a segment image in one target locale.
 * Owns its abort controller so cancelling the attempt also cancels its request.
 */
export class ContentEditorImageGeneration {
  status: ContentEditorImageGenerationStatus = "running";
  readonly startedAt = Date.now();
  readonly #abort = new AbortController();

  constructor(
    readonly segmentId: string,
    readonly locale: string,
  ) {
    makeAutoObservable(
      this,
      { segmentId: false, locale: false, startedAt: false, signal: false },
      { autoBind: true },
    );
  }

  get signal() {
    return this.#abort.signal;
  }

  get isRunning() {
    return this.status === "running";
  }

  fail() {
    this.status = "failed";
  }

  cancel() {
    this.#abort.abort();
  }
}

/**
 * Per-locale image generation progress for the multilingual gallery.
 * Lives on the workspace so switching File ↔ Multilingual does not drop in-flight work.
 *
 * Only the current attempt for a segment and locale may settle: once an attempt is
 * cancelled or replaced, its late success or failure is ignored.
 */
export class ContentEditorImageGenerationStore {
  readonly #generations = observable.map<string, ContentEditorImageGeneration>({}, { deep: false });

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true });
  }

  get(segmentId: string, locale: string) {
    return this.#generations.get(contentEditorImageGenerationKey(segmentId, locale));
  }

  get runningCount() {
    let count = 0;
    for (const generation of this.#generations.values()) {
      if (generation.isRunning) {
        count += 1;
      }
    }
    return count;
  }

  /** Starts `work` unless this segment and locale already has a running attempt. */
  async run(segmentId: string, locale: string, work: ContentEditorImageGenerationWork) {
    const key = contentEditorImageGenerationKey(segmentId, locale);
    if (this.#generations.get(key)?.isRunning) {
      return;
    }
    const generation = new ContentEditorImageGeneration(segmentId, locale);
    this.#generations.set(key, generation);

    let succeeded: boolean;
    try {
      await work(generation.signal);
      succeeded = true;
    } catch {
      succeeded = false;
    }

    runInAction(() => {
      if (this.#generations.get(key) !== generation) {
        return;
      }
      if (succeeded) {
        this.#generations.delete(key);
      } else {
        generation.fail();
      }
    });
  }

  /** Aborts every in-flight attempt and drops all progress, including failures. */
  cancelAll() {
    for (const generation of this.#generations.values()) {
      generation.cancel();
    }
    this.#generations.clear();
  }
}
