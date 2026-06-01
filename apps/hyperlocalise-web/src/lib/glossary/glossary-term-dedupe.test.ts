import { describe, expect, it } from "vite-plus/test";

import { createGlossaryTermDuplicateTracker } from "./glossary-term-dedupe";

describe("createGlossaryTermDuplicateTracker", () => {
  it("uses exact keys for case-sensitive terms", () => {
    const tracker = createGlossaryTermDuplicateTracker([{ sourceTerm: "Hello" }]);

    expect(tracker.hasDuplicateAndTrack({ sourceTerm: "Hello", caseSensitive: true })).toBe(true);
    expect(tracker.hasDuplicateAndTrack({ sourceTerm: "hello", caseSensitive: true })).toBe(false);
  });

  it("uses lowercased keys for case-insensitive terms", () => {
    const tracker = createGlossaryTermDuplicateTracker([{ sourceTerm: "Hello" }]);

    expect(tracker.hasDuplicateAndTrack({ sourceTerm: "hello", caseSensitive: false })).toBe(true);
  });
});
