import { describe, expect, it } from "vite-plus/test";

import { getSegmentTagKind } from "./cat-segment-tags";

describe("getSegmentTagKind", () => {
  it("classifies segment type tags", () => {
    expect(getSegmentTagKind("icu")).toBe("type");
    expect(getSegmentTagKind("text")).toBe("type");
    expect(getSegmentTagKind("dashboard")).toBe("type");
  });

  it("classifies comment count tags", () => {
    expect(getSegmentTagKind("1 comment")).toBe("comment");
    expect(getSegmentTagKind("2 comments")).toBe("comment");
  });

  it("classifies issue count tags", () => {
    expect(getSegmentTagKind("1 issue")).toBe("issue");
    expect(getSegmentTagKind("3 issues")).toBe("issue");
  });
});
