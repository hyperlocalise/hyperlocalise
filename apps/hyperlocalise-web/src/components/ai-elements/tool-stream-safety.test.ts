import { describe, expect, it } from "vite-plus/test";

import { normalizeCodeBlockSource } from "./code-block";
import { extractToolInputDetail, serializeToolJson } from "./tool";

describe("serializeToolJson", () => {
  it("returns {} when input is undefined (streaming tool args)", () => {
    // JSON.stringify(undefined) is undefined — that previously crashed CodeBlock.split
    expect(JSON.stringify(undefined, null, 2)).toBeUndefined();
    expect(serializeToolJson(undefined)).toBe("{}");
  });

  it("stringifies objects and null", () => {
    expect(serializeToolJson({ path: "src/a.ts" })).toBe('{\n  "path": "src/a.ts"\n}');
    expect(serializeToolJson(null)).toBe("null");
  });
});

describe("extractToolInputDetail", () => {
  it("prefers known keys like path and command", () => {
    expect(extractToolInputDetail({ path: "math.ts", other: "x" })).toBe("math.ts");
    expect(extractToolInputDetail({ command: "npm test" })).toBe("npm test");
  });

  it("returns null for empty or non-object input", () => {
    expect(extractToolInputDetail(undefined)).toBeNull();
    expect(extractToolInputDetail(null)).toBeNull();
    expect(extractToolInputDetail("grep")).toBeNull();
    expect(extractToolInputDetail({})).toBeNull();
  });
});

describe("normalizeCodeBlockSource", () => {
  it("coerces nullish code to an empty string", () => {
    expect(normalizeCodeBlockSource(undefined)).toBe("");
    expect(normalizeCodeBlockSource(null)).toBe("");
    expect(normalizeCodeBlockSource("line")).toBe("line");
  });
});
