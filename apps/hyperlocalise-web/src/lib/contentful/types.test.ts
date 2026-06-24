import { describe, expect, it } from "vite-plus/test";

import { hasContentfulNoWriteback } from "./types";

describe("hasContentfulNoWriteback", () => {
  it.each([
    {
      name: "fails when draft writing is enabled, fields were detected, and nothing was written",
      input: { writeDrafts: true, fieldsDetected: 1, localeValuesWritten: 0 },
      expected: true,
    },
    {
      name: "treats missing writeDrafts as draft writing enabled",
      input: { fieldsDetected: 1, localeValuesWritten: 0 },
      expected: true,
    },
    {
      name: "does not fail when draft writing is disabled",
      input: { writeDrafts: false, fieldsDetected: 1, localeValuesWritten: 0 },
      expected: false,
    },
    {
      name: "does not fail when no fields were detected",
      input: { writeDrafts: true, fieldsDetected: 0, localeValuesWritten: 0 },
      expected: false,
    },
    {
      name: "does not fail when at least one locale value was written",
      input: { writeDrafts: true, fieldsDetected: 2, localeValuesWritten: 1 },
      expected: false,
    },
  ])("$name", ({ input, expected }) => {
    expect(hasContentfulNoWriteback(input)).toBe(expected);
  });
});
