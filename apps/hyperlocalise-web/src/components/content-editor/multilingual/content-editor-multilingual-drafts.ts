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

/** A cell outlives its virtualized row and owns its serial write queue. */
export class MultilingualDraft {
  text: string;
  savedText: string;
  saving = false;
  error: string | null = null;
  private requestedText: string | null = null;
  private submittedText: string | null = null;
  private ignoreSaveError = false;

  constructor(text: string) {
    this.text = text;
    this.savedText = text;
    makeAutoObservable(this, {}, { autoBind: true });
  }

  get dirty() {
    return this.text !== this.savedText || this.saving;
  }
  change(text: string) {
    this.text = text;
    this.error = null;
  }
  cancel() {
    this.requestedText = null;
    this.error = null;
    if (this.saving && this.submittedText !== null) {
      this.text = this.submittedText;
      this.ignoreSaveError = true;
      return;
    }
    this.text = this.savedText;
  }

  async save(write: (text: string) => Promise<void>) {
    this.requestedText = this.text;
    if (this.saving) return;
    this.saving = true;
    this.error = null;
    this.ignoreSaveError = false;
    try {
      while (this.requestedText !== null) {
        const submitted = this.requestedText;
        this.requestedText = null;
        if (submitted === this.savedText) continue;
        this.submittedText = submitted;
        await write(submitted);
        runInAction(() => {
          this.savedText = submitted;
          this.submittedText = null;
        });
      }
    } catch (error) {
      runInAction(() => {
        this.requestedText = null;
        this.submittedText = null;
        if (this.ignoreSaveError) {
          this.text = this.savedText;
          this.error = null;
          this.ignoreSaveError = false;
          return;
        }
        this.error = error instanceof Error ? error.message : String(error);
      });
    } finally {
      runInAction(() => {
        this.saving = false;
        this.submittedText = null;
      });
    }
  }
}

export class MultilingualDrafts {
  readonly cells = observable.map<string, MultilingualDraft>();
  constructor() {
    makeAutoObservable(this, {}, { autoBind: true });
  }
  get dirty() {
    return [...this.cells.values()].some((cell) => cell.dirty);
  }
  get(key: string, text: string) {
    let cell = this.cells.get(key);
    if (!cell) {
      cell = new MultilingualDraft(text);
      this.cells.set(key, cell);
    } else if (!cell.dirty && !cell.error) {
      cell.text = text;
      cell.savedText = text;
    }
    return cell;
  }
  releaseInactive(activeId: string | undefined, activeLocale: string | undefined) {
    for (const [key, cell] of this.cells) {
      const [, , id, locale] = JSON.parse(key) as string[];
      if ((id !== activeId || locale !== activeLocale) && !cell.dirty && !cell.error)
        this.cells.delete(key);
    }
  }
  release(key: string) {
    const cell = this.cells.get(key);
    if (cell && !cell.dirty && !cell.error) this.cells.delete(key);
  }
  clear() {
    this.cells.clear();
  }
}
