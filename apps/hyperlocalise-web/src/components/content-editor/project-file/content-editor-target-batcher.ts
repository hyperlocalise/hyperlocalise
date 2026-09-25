"use client";

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
import type {
  ProjectFileCatTargetsInput,
  ProjectFileCatTargetRow,
  ProjectFileContentEditorTranslation,
} from "@/api/routes/project/project.schema";
import { createContentEditorRequestScheduler } from "../shared/content-editor-request-scheduler";

type Cell = { sourcePath: string; externalStringId: string; targetLocale: string };
type Pending = {
  cell: Cell;
  signal?: AbortSignal;
  priority: boolean;
  resolve: (target: ProjectFileContentEditorTranslation | null) => void;
  reject: (error: unknown) => void;
  cleanup: () => void;
  cancelled: boolean;
};
const MAX_SEGMENTS = 50;
const MAX_LOCALES = 8;
const MAX_CELLS = 200;
const abortError = () => new DOMException("Request aborted", "AbortError");

/** Coalesce cell subscriptions into bounded rectangles. Cancel a shared read only when all its subscribers leave. */
export function createTargetBatcher(
  fetch: (
    body: ProjectFileCatTargetsInput,
    signal: AbortSignal,
  ) => Promise<ProjectFileCatTargetRow[]>,
) {
  let pending: Pending[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = createContentEditorRequestScheduler(2);
  const flush = () => {
    timer = undefined;
    const waiting = pending
      .filter((entry) => !entry.cancelled)
      .sort((a, b) => Number(b.priority) - Number(a.priority));
    pending = [];
    while (waiting.length) {
      const group: Pending[] = [];
      const segments = new Map<string, Cell>();
      const locales = new Set<string>();
      while (waiting.length) {
        const entry = waiting[0];
        const key = JSON.stringify([entry.cell.sourcePath, entry.cell.externalStringId]);
        const segmentCount = segments.size + Number(!segments.has(key));
        const localeCount = locales.size + Number(!locales.has(entry.cell.targetLocale));
        if (
          segmentCount > MAX_SEGMENTS ||
          localeCount > MAX_LOCALES ||
          segmentCount * localeCount > MAX_CELLS
        )
          break;
        group.push(waiting.shift()!);
        segments.set(key, entry.cell);
        locales.add(entry.cell.targetLocale);
      }
      const controller = new AbortController();
      const abort = () => {
        if (group.every((entry) => entry.cancelled || entry.signal?.aborted)) controller.abort();
      };
      for (const entry of group) entry.signal?.addEventListener("abort", abort);
      abort();
      void schedule(
        () =>
          fetch(
            {
              segments: [...segments.values()].map(({ sourcePath, externalStringId }) => ({
                sourcePath,
                externalStringId,
              })),
              targetLocales: [...locales],
            },
            controller.signal,
          ),
        controller.signal,
        group.some((entry) => entry.priority),
      )
        .then(
          (rows) => {
            const targets = new Map(
              rows.map((row) => [
                JSON.stringify([row.sourcePath, row.externalStringId]),
                row.targets,
              ]),
            );
            for (const entry of group) {
              if (entry.cancelled) continue;
              const values = targets.get(
                JSON.stringify([entry.cell.sourcePath, entry.cell.externalStringId]),
              );
              if (!values || !(entry.cell.targetLocale in values))
                entry.reject(new Error("Incomplete translation rectangle"));
              else entry.resolve(values[entry.cell.targetLocale]);
            }
          },
          (error: unknown) => {
            for (const entry of group) if (!entry.cancelled) entry.reject(error);
          },
        )
        .finally(() => {
          for (const entry of group) {
            entry.cleanup();
            entry.signal?.removeEventListener("abort", abort);
          }
        });
    }
  };
  return (
    cell: Cell,
    signal?: AbortSignal,
    priority = false,
  ): Promise<ProjectFileContentEditorTranslation | null> =>
    new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(abortError());
        return;
      }
      const entry: Pending = {
        cell,
        signal,
        priority,
        resolve,
        reject,
        cancelled: false,
        cleanup: () => signal?.removeEventListener("abort", abort),
      };
      const abort = () => {
        entry.cancelled = true;
        reject(abortError());
      };
      signal?.addEventListener("abort", abort, { once: true });
      pending.push(entry);
      timer ??= setTimeout(flush, 0);
    });
}
