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

export type ContentEditorImageGenerationHandle = {
  generation: number;
  signal: AbortSignal;
};

export function contentEditorImageGenerationKey(segmentId: string, locale: string) {
  return JSON.stringify([segmentId, locale]);
}

function isAbortError(error: unknown) {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

/**
 * Per-locale image generation progress for the multilingual gallery.
 * Lives on the workspace so switching File ↔ Multilingual does not drop in-flight work.
 */
export class ContentEditorImageGenerationStore {
  readonly states = observable.map<string, ContentEditorImageGenerationState>();
  #nextGeneration = 0;
  readonly #generations = new Map<string, number>();
  readonly #aborts = new Map<string, AbortController>();

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

  start(segmentId: string, locale: string): ContentEditorImageGenerationHandle | null {
    const current = this.get(segmentId, locale);
    if (current?.status === "running") {
      return null;
    }
    const key = contentEditorImageGenerationKey(segmentId, locale);
    this.#nextGeneration += 1;
    const generation = this.#nextGeneration;
    const abort = new AbortController();
    this.#generations.set(key, generation);
    this.#aborts.set(key, abort);
    this.states.set(key, {
      status: "running",
      startedAt: Date.now(),
    });
    return { generation, signal: abort.signal };
  }

  succeed(segmentId: string, locale: string, generation: number) {
    const key = contentEditorImageGenerationKey(segmentId, locale);
    if (!this.#isCurrentGeneration(key, generation)) {
      return;
    }
    this.#forget(key);
    this.states.delete(key);
  }

  fail(segmentId: string, locale: string, generation: number) {
    const key = contentEditorImageGenerationKey(segmentId, locale);
    if (!this.#isCurrentGeneration(key, generation)) {
      return;
    }
    this.#forget(key);
    this.states.set(key, { status: "failed" });
  }

  /**
   * Drops progress and aborts every in-flight generation so a later settle
   * cannot mark a newer request finished or failed.
   */
  clear() {
    for (const abort of this.#aborts.values()) {
      abort.abort();
    }
    this.#aborts.clear();
    this.#generations.clear();
    this.states.clear();
  }

  async run(segmentId: string, locale: string, work: (signal: AbortSignal) => Promise<void>) {
    const handle = this.start(segmentId, locale);
    if (!handle) {
      return;
    }
    try {
      await work(handle.signal);
      if (handle.signal.aborted) {
        return;
      }
      runInAction(() => this.succeed(segmentId, locale, handle.generation));
    } catch (error) {
      if (handle.signal.aborted || isAbortError(error)) {
        return;
      }
      runInAction(() => this.fail(segmentId, locale, handle.generation));
    }
  }

  #isCurrentGeneration(key: string, generation: number) {
    return this.#generations.get(key) === generation && this.states.get(key)?.status === "running";
  }

  #forget(key: string) {
    this.#generations.delete(key);
    this.#aborts.delete(key);
  }
}
