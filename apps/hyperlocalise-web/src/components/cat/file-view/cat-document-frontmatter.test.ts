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

import { joinCatDocument, splitCatDocument } from "./cat-document-frontmatter";

describe("splitCatDocument", () => {
  it("returns the full text as body when there is no frontmatter", () => {
    expect(splitCatDocument("# Hello\n\nBody.\n")).toEqual({
      fields: [],
      body: "# Hello\n\nBody.\n",
      hasFrontmatter: false,
    });
  });

  it("extracts scalar frontmatter fields and leaves the body for TipTap", () => {
    expect(
      splitCatDocument("---\ntitle: Docs\ndescription: Intro page\n---\n\n# Hello\n"),
    ).toEqual({
      fields: [
        { key: "title", value: "Docs" },
        { key: "description", value: "Intro page" },
      ],
      body: "\n# Hello\n",
      hasFrontmatter: true,
    });
  });
});

describe("joinCatDocument", () => {
  it("reconstructs a markdown file from fields and body", () => {
    expect(
      joinCatDocument({
        hasFrontmatter: true,
        fields: [{ key: "title", value: "Docs" }],
        body: "# Hello\n",
      }),
    ).toBe("---\ntitle: Docs\n---\n# Hello\n");
  });

  it("leaves body-only documents unchanged", () => {
    expect(
      joinCatDocument({
        hasFrontmatter: false,
        fields: [],
        body: "# Hello\n",
      }),
    ).toBe("# Hello\n");
  });
});
