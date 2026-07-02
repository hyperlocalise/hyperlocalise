import { describe, expect, it } from "vite-plus/test";

import { convertWordsToLorem } from "./lorem_generator";

describe("convertWordsToLorem", () => {
  it("preserves word count per string", () => {
    const result = convertWordsToLorem(["hello brave world", "foo"]);

    expect(result[0]?.split(" ")).toHaveLength(3);
    expect(result[1]?.split(" ")).toHaveLength(1);
  });
});
