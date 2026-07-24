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
import { err, ok, type Result } from "@/lib/primitives/result/results";
import { assertNever } from "@/lib/primitives/assert-never/assert-never";

import { KNOWLEDGE_MEMORY_CONTENT_MAX_LENGTH } from "./knowledge-memory.shared";

export const KNOWLEDGE_MEMORY_MAX_EDITS = 10;

export type KnowledgeMemoryEdit =
  | { operation: "replace"; matchText: string; replacementText: string }
  | { operation: "delete"; matchText: string }
  | { operation: "insert_before"; anchorText: string; insertText: string }
  | { operation: "insert_after"; anchorText: string; insertText: string }
  | { operation: "append"; insertText: string };

export type KnowledgeMemoryEditError =
  | { code: "invalid_edit_count" }
  | { code: "invalid_edit"; editIndex: number }
  | { code: "target_not_found"; editIndex: number }
  | { code: "target_ambiguous"; editIndex: number }
  | { code: "content_too_long"; editIndex: number };

function findUniqueTarget(
  content: string,
  target: string,
  editIndex: number,
): Result<number, KnowledgeMemoryEditError> {
  if (!target) {
    return err({ code: "invalid_edit", editIndex });
  }

  const firstIndex = content.indexOf(target);
  if (firstIndex === -1) {
    return err({ code: "target_not_found", editIndex });
  }

  if (content.indexOf(target, firstIndex + 1) !== -1) {
    return err({ code: "target_ambiguous", editIndex });
  }

  return ok(firstIndex);
}

function insertAt(content: string, index: number, text: string) {
  return `${content.slice(0, index)}${text}${content.slice(index)}`;
}

function isAlreadyInsertedAt(content: string, index: number, text: string) {
  return index >= 0 && content.slice(index, index + text.length) === text;
}

function containsExactMarkdownBlock(content: string, text: string) {
  let index = content.indexOf(text);

  while (index !== -1) {
    const endIndex = index + text.length;
    const startsAtBoundary = index === 0 || content[index - 1] === "\n";
    const endsAtBoundary = endIndex === content.length || content[endIndex] === "\n";
    if (startsAtBoundary && endsAtBoundary) {
      return true;
    }
    index = content.indexOf(text, index + 1);
  }

  return false;
}

export function applyKnowledgeMemoryEdits(
  content: string,
  edits: readonly KnowledgeMemoryEdit[],
): Result<string, KnowledgeMemoryEditError> {
  if (edits.length < 1 || edits.length > KNOWLEDGE_MEMORY_MAX_EDITS) {
    return err({ code: "invalid_edit_count" });
  }

  let updatedContent = content;

  for (const [editIndex, edit] of edits.entries()) {
    switch (edit.operation) {
      case "replace": {
        if (!edit.replacementText) {
          return err({ code: "invalid_edit", editIndex });
        }
        const target = findUniqueTarget(updatedContent, edit.matchText, editIndex);
        if (!target.ok) {
          return target;
        }
        updatedContent = `${updatedContent.slice(0, target.value)}${edit.replacementText}${updatedContent.slice(target.value + edit.matchText.length)}`;
        break;
      }
      case "delete": {
        const target = findUniqueTarget(updatedContent, edit.matchText, editIndex);
        if (!target.ok) {
          return target;
        }
        updatedContent = `${updatedContent.slice(0, target.value)}${updatedContent.slice(target.value + edit.matchText.length)}`;
        break;
      }
      case "insert_before": {
        if (!edit.insertText) {
          return err({ code: "invalid_edit", editIndex });
        }
        const target = findUniqueTarget(updatedContent, edit.anchorText, editIndex);
        if (!target.ok) {
          return target;
        }
        if (
          isAlreadyInsertedAt(
            updatedContent,
            target.value - edit.insertText.length,
            edit.insertText,
          )
        ) {
          break;
        }
        updatedContent = insertAt(updatedContent, target.value, edit.insertText);
        break;
      }
      case "insert_after": {
        if (!edit.insertText) {
          return err({ code: "invalid_edit", editIndex });
        }
        const target = findUniqueTarget(updatedContent, edit.anchorText, editIndex);
        if (!target.ok) {
          return target;
        }
        const insertionIndex = target.value + edit.anchorText.length;
        if (isAlreadyInsertedAt(updatedContent, insertionIndex, edit.insertText)) {
          break;
        }
        updatedContent = insertAt(updatedContent, insertionIndex, edit.insertText);
        break;
      }
      case "append": {
        if (!edit.insertText) {
          return err({ code: "invalid_edit", editIndex });
        }
        if (!containsExactMarkdownBlock(updatedContent, edit.insertText)) {
          updatedContent =
            updatedContent.length === 0
              ? edit.insertText
              : `${updatedContent}${updatedContent.endsWith("\n") ? "" : "\n\n"}${edit.insertText}`;
        }
        break;
      }
      default:
        return assertNever(edit);
    }

    if (updatedContent.length > KNOWLEDGE_MEMORY_CONTENT_MAX_LENGTH) {
      return err({ code: "content_too_long", editIndex });
    }
  }

  return ok(updatedContent);
}
