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

import { demoteMarkdownHeadings } from "./llms-content";

describe("demoteMarkdownHeadings", () => {
  it("shifts headings down and caps them at h6", () => {
    expect(demoteMarkdownHeadings("# Title\n\n## Part\n\n#### Deep", 3)).toBe(
      "#### Title\n\n##### Part\n\n###### Deep",
    );
  });

  it("leaves fenced code and non-heading hashes alone", () => {
    const input = "```bash\n# a shell comment\n```\n#hashtag\n## Real";

    expect(demoteMarkdownHeadings(input, 2)).toBe(
      "```bash\n# a shell comment\n```\n#hashtag\n#### Real",
    );
  });
});
