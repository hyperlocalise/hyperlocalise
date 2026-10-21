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

export type ContentEditorTargetInsertHandler = (text: string) => boolean;

const registeredHandlers = new Set<ContentEditorTargetInsertHandler>();
let focusedHandler: ContentEditorTargetInsertHandler | null = null;

export function registerContentEditorTargetInsert(
  handler: ContentEditorTargetInsertHandler,
): () => void {
  registeredHandlers.add(handler);
  if (focusedHandler === null) {
    focusedHandler = handler;
  }

  return () => {
    registeredHandlers.delete(handler);
    if (focusedHandler === handler) {
      focusedHandler = registeredHandlers.values().next().value ?? null;
    }
  };
}

export function markContentEditorTargetInsertFocused(
  handler: ContentEditorTargetInsertHandler,
): void {
  if (registeredHandlers.has(handler)) {
    focusedHandler = handler;
  }
}

export function insertTextIntoActiveContentEditorTarget(text: string): boolean {
  if (text.length === 0) {
    return false;
  }

  const handler = focusedHandler ?? registeredHandlers.values().next().value;
  return handler?.(text) ?? false;
}

export function resetContentEditorTargetInsertForTests(): void {
  registeredHandlers.clear();
  focusedHandler = null;
}
