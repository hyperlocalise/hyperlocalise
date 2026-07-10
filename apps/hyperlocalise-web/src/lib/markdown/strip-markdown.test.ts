import { describe, expect, it } from "vite-plus/test";

import { stripMarkdown } from "./strip-markdown";

describe("stripMarkdown", () => {
  it("strips bold, inline code, and list markers for inbox-style previews", () => {
    expect(stripMarkdown("**HL-Test** progress:\n- **Vietnamese (`vi`)**: **Answer**")).toBe(
      "HL-Test progress: Vietnamese (vi): Answer",
    );
  });

  it("keeps link labels and image alt text", () => {
    expect(stripMarkdown("See [docs](https://example.com) and ![logo](logo.png)")).toBe(
      "See docs and logo",
    );
  });

  it("collapses whitespace into a single line", () => {
    expect(stripMarkdown("## Title\n\n> quoted\n\n1. first")).toBe("Title quoted first");
  });
});
