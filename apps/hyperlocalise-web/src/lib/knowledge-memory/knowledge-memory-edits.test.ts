import { describe, expect, it } from "vite-plus/test";

import { isErr, isOk } from "@/lib/primitives/result/results";

import {
  applyKnowledgeMemoryEdits,
  KNOWLEDGE_MEMORY_MAX_EDITS,
  type KnowledgeMemoryEdit,
} from "./knowledge-memory-edits";
import { KNOWLEDGE_MEMORY_CONTENT_MAX_LENGTH } from "./knowledge-memory.shared";

describe("applyKnowledgeMemoryEdits", () => {
  it("applies exact edits sequentially while preserving unrelated markdown", () => {
    const content = [
      "# Memory.md",
      "",
      "## Voice",
      "Use a friendly voice.",
      "",
      "## Brand",
      "Never translate Hyperlocalise.",
    ].join("\n");

    const result = applyKnowledgeMemoryEdits(content, [
      {
        operation: "replace",
        matchText: "Use a friendly voice.",
        replacementText: "Use a concise, friendly voice.",
      },
      {
        operation: "insert_after",
        anchorText: "Never translate Hyperlocalise.",
        insertText: "\nNever abbreviate the product name.",
      },
      {
        operation: "insert_before",
        anchorText: "## Brand",
        insertText: "## Buttons\nUse sentence case.\n\n",
      },
      {
        operation: "append",
        insertText: "## Checkout\nPrefer short payment labels.",
      },
    ]);

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) {
      return;
    }
    expect(result.value).toBe(
      [
        "# Memory.md",
        "",
        "## Voice",
        "Use a concise, friendly voice.",
        "",
        "## Buttons",
        "Use sentence case.",
        "",
        "## Brand",
        "Never translate Hyperlocalise.",
        "Never abbreviate the product name.",
        "",
        "## Checkout",
        "Prefer short payment labels.",
      ].join("\n"),
    );
  });

  it("supports deletion and appending to an empty document", () => {
    const deleted = applyKnowledgeMemoryEdits("Keep this.\nDelete this.", [
      { operation: "delete", matchText: "\nDelete this." },
    ]);
    const appended = applyKnowledgeMemoryEdits("", [
      { operation: "append", insertText: "# Memory.md\n\nUse sentence case." },
    ]);

    expect(isOk(deleted) && deleted.value).toBe("Keep this.");
    expect(isOk(appended) && appended.value).toBe("# Memory.md\n\nUse sentence case.");
  });

  it.each([
    {
      name: "missing",
      content: "## Voice\nBe clear.",
      edit: { operation: "delete", matchText: "Not saved." } as KnowledgeMemoryEdit,
      code: "target_not_found",
    },
    {
      name: "ambiguous",
      content: "Keep terms.\nKeep terms.",
      edit: { operation: "delete", matchText: "Keep terms." } as KnowledgeMemoryEdit,
      code: "target_ambiguous",
    },
  ])("fails atomically when an exact target is $name", ({ content, edit, code }) => {
    const result = applyKnowledgeMemoryEdits(content, [
      { operation: "append", insertText: "This intermediate edit must not escape." },
      edit,
    ]);

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error).toMatchObject({ code, editIndex: 1 });
    }
    expect(content).not.toContain("intermediate");
  });

  it("rejects invalid edit counts and empty edit text", () => {
    expect(applyKnowledgeMemoryEdits("content", [])).toMatchObject({
      ok: false,
      error: { code: "invalid_edit_count" },
    });
    expect(
      applyKnowledgeMemoryEdits(
        "content",
        Array.from({ length: KNOWLEDGE_MEMORY_MAX_EDITS + 1 }, () => ({
          operation: "append" as const,
          insertText: "x",
        })),
      ),
    ).toMatchObject({ ok: false, error: { code: "invalid_edit_count" } });
    expect(
      applyKnowledgeMemoryEdits("content", [{ operation: "append", insertText: "" }]),
    ).toMatchObject({ ok: false, error: { code: "invalid_edit", editIndex: 0 } });
  });

  it("rejects a result over the document limit without returning partial content", () => {
    const result = applyKnowledgeMemoryEdits("a".repeat(KNOWLEDGE_MEMORY_CONTENT_MAX_LENGTH), [
      { operation: "append", insertText: "x" },
    ]);

    expect(result).toMatchObject({
      ok: false,
      error: { code: "content_too_long", editIndex: 0 },
    });
  });

  it("is deterministic for repeated inputs", () => {
    const edits: KnowledgeMemoryEdit[] = [
      { operation: "replace", matchText: "old", replacementText: "new" },
      { operation: "append", insertText: "tail" },
    ];

    const first = applyKnowledgeMemoryEdits("old", edits);
    const second = applyKnowledgeMemoryEdits("old", edits);

    expect(first).toEqual(second);
  });
});
