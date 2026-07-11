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

  it("handles nested parentheses and empty link labels", () => {
    expect(
      stripMarkdown(
        "Read [Markdown](https://en.wikipedia.org/wiki/Markdown_(language)) or [](https://example.com)",
      ),
    ).toBe("Read Markdown or https://example.com");
  });

  it("collapses whitespace into a single line", () => {
    expect(stripMarkdown("## Title\n\n> quoted\n\n1. first")).toBe("Title quoted first");
  });

  it("preserves snake_case identifiers", () => {
    expect(stripMarkdown("Changed src/file_name_test.ts on branch feature_fix")).toBe(
      "Changed src/file_name_test.ts on branch feature_fix",
    );
  });
});
