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

  it("keeps user and issue mention labels without mention hrefs", () => {
    expect(
      stripMarkdown(
        "Hello [@Vi Nguyen](mention:user:962fec59-8275-4000-8000-000000000001) see [@HL-12](mention:issue:22222222-2222-4222-8222-222222222222:project_website)",
      ),
    ).toBe("Hello @Vi Nguyen see @HL-12");
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
