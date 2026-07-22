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
        updatedContent = insertAt(
          updatedContent,
          target.value + edit.anchorText.length,
          edit.insertText,
        );
        break;
      }
      case "append": {
        if (!edit.insertText) {
          return err({ code: "invalid_edit", editIndex });
        }
        updatedContent =
          updatedContent.length === 0
            ? edit.insertText
            : `${updatedContent}${updatedContent.endsWith("\n") ? "" : "\n\n"}${edit.insertText}`;
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
