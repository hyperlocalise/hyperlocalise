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
import { describe, expect, it } from "vite-plus/test";

import {
  composeIssueDescription,
  resolveDescriptionOnTemplateChange,
  stripEmptySections,
} from "./issue-sheet-template-description";

const SKELETON_A = "## Heading A\n";
const SKELETON_B = "## Heading B\n";

describe("resolveDescriptionOnTemplateChange", () => {
  it("explicit pick always replaces, even a dirty description", () => {
    expect(
      resolveDescriptionOnTemplateChange({
        currentDescription: "I already typed something",
        isDirty: true,
        nextSkeleton: SKELETON_B,
        origin: "explicit_pick",
      }),
    ).toBe(SKELETON_B);
  });

  it("explicit pick replaces a pristine description too", () => {
    expect(
      resolveDescriptionOnTemplateChange({
        currentDescription: SKELETON_A,
        isDirty: false,
        nextSkeleton: SKELETON_B,
        origin: "explicit_pick",
      }),
    ).toBe(SKELETON_B);
  });

  it("explicit clear drops the skeleton only while pristine", () => {
    expect(
      resolveDescriptionOnTemplateChange({
        currentDescription: SKELETON_A,
        isDirty: false,
        nextSkeleton: null,
        origin: "explicit_clear",
      }),
    ).toBe("");
  });

  it("explicit clear leaves a dirty description untouched", () => {
    expect(
      resolveDescriptionOnTemplateChange({
        currentDescription: "user wrote this over the skeleton",
        isDirty: true,
        nextSkeleton: null,
        origin: "explicit_clear",
      }),
    ).toBe("user wrote this over the skeleton");
  });

  it("automatic application applies only while pristine", () => {
    expect(
      resolveDescriptionOnTemplateChange({
        currentDescription: "",
        isDirty: false,
        nextSkeleton: SKELETON_A,
        origin: "automatic",
      }),
    ).toBe(SKELETON_A);
  });

  it("automatic application never overwrites a dirty description", () => {
    expect(
      resolveDescriptionOnTemplateChange({
        currentDescription: "user typed before the default resolved",
        isDirty: true,
        nextSkeleton: SKELETON_A,
        origin: "automatic",
      }),
    ).toBe("user typed before the default resolved");
  });
});

describe("composeIssueDescription", () => {
  it("returns the skeleton alone when there is no source text", () => {
    expect(
      composeIssueDescription({ skeleton: SKELETON_A, sourceText: null, sourceLabel: "Source:" }),
    ).toBe(SKELETON_A);
  });

  it("appends a blockquoted source below the skeleton", () => {
    const result = composeIssueDescription({
      skeleton: SKELETON_A,
      sourceText: "Save changes",
      sourceLabel: "Source:",
    });
    expect(result).toBe(`${SKELETON_A}\n> Source:\n>\n> Save changes\n`);
  });

  it("quotes every line of multi-line source text, not just the first", () => {
    const result = composeIssueDescription({
      skeleton: null,
      sourceText: "Line one\nLine two",
      sourceLabel: "Source:",
    });
    expect(result).toBe("> Source:\n>\n> Line one\n> Line two\n");
  });

  it("treats whitespace-only source text as absent", () => {
    expect(
      composeIssueDescription({ skeleton: SKELETON_A, sourceText: "   ", sourceLabel: "Source:" }),
    ).toBe(SKELETON_A);
  });
});

describe("stripEmptySections", () => {
  it("leaves text with no headings untouched", () => {
    const text = "just some prose, no headings here";
    expect(stripEmptySections(text)).toBe(text);
  });

  it("removes a heading with nothing under it", () => {
    const input = "## Filled\n\nSome content\n\n## Empty\n\n";
    expect(stripEmptySections(input)).toBe("## Filled\n\nSome content");
  });

  it("keeps a heading whose only content is whitespace-free but non-blank", () => {
    const input = "## Filled\n\nSome content\n";
    expect(stripEmptySections(input)).toBe("## Filled\n\nSome content");
  });

  it("removes every empty section and keeps every filled one", () => {
    const input = [
      "## Which check failed",
      "",
      "## Expected result",
      "",
      "It should save",
      "",
      "## Actual result",
      "",
      "## How to reproduce",
      "",
      "Click save twice",
      "",
    ].join("\n");
    expect(stripEmptySections(input)).toBe(
      [
        "## Expected result",
        "",
        "It should save",
        "",
        "## How to reproduce",
        "",
        "Click save twice",
      ].join("\n"),
    );
  });

  it("leaves a blockquote appended after the last heading, even if the heading has no other content", () => {
    const input = "## Where this appears\n\n> Source:\n>\n> Save changes\n";
    expect(stripEmptySections(input)).toBe("## Where this appears\n\n> Source:\n>\n> Save changes");
  });

  it("counts a nested subheading and its content as the parent section's content", () => {
    const input = "## Parent\n\n### Child\n\nChild content\n";
    expect(stripEmptySections(input)).toBe("## Parent\n\n### Child\n\nChild content");
  });

  it("keeps a parent whose only content is a subheading, even when that subheading's own body is empty", () => {
    // The parent's own emptiness check sees the "### Child" line as non-blank content and keeps
    // "## Parent". The child is evaluated independently and removed because nothing follows it
    // before "## Next". Not a recursive emptiness check — deliberately structural per-heading.
    const input = "## Parent\n\n### Child\n\n## Next\n\nFilled\n";
    expect(stripEmptySections(input)).toBe("## Parent\n\n## Next\n\nFilled");
  });
});
