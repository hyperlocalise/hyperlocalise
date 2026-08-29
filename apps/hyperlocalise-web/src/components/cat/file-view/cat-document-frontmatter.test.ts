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
      rawFrontmatter: "",
    });
  });

  it("extracts scalar frontmatter fields and leaves the body for TipTap", () => {
    expect(splitCatDocument("---\ntitle: Docs\ndescription: Intro page\n---\n\n# Hello\n")).toEqual(
      {
        fields: [
          { key: "title", value: "Docs", rawValue: "Docs" },
          { key: "description", value: "Intro page", rawValue: "Intro page" },
        ],
        body: "\n# Hello\n",
        hasFrontmatter: true,
        rawFrontmatter: "title: Docs\ndescription: Intro page",
      },
    );
  });

  it("keeps nested YAML, lists, and comments out of editable fields", () => {
    const text = `---
title: Docs
# keep this comment
tags:
  - one
  - two
authors:
  - name: Ada
description: |
  Multi-line
---

# Hello
`;
    expect(splitCatDocument(text)).toEqual({
      fields: [{ key: "title", value: "Docs", rawValue: "Docs" }],
      body: "\n# Hello\n",
      hasFrontmatter: true,
      rawFrontmatter:
        "title: Docs\n# keep this comment\ntags:\n  - one\n  - two\nauthors:\n  - name: Ada\ndescription: |\n  Multi-line",
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

  it("patches scalar fields without dropping nested YAML or comments", () => {
    const rawFrontmatter = `title: Docs
# keep this comment
tags:
  - one
  - two
authors:
  - name: Ada
description: |
  Multi-line`;
    expect(
      joinCatDocument({
        hasFrontmatter: true,
        fields: [{ key: "title", value: "Guides" }],
        body: "# Hello\n",
        rawFrontmatter,
      }),
    ).toBe(`---
title: Guides
# keep this comment
tags:
  - one
  - two
authors:
  - name: Ada
description: |
  Multi-line
---
# Hello
`);
  });

  it("keeps original quoting for untouched scalars", () => {
    const rawFrontmatter = `title: "true"
code: "001"`;
    const split = splitCatDocument(`---\n${rawFrontmatter}\n---\n\n# Hello\n`);
    expect(
      joinCatDocument({
        hasFrontmatter: true,
        fields: split.fields,
        body: "# Hello\n",
        rawFrontmatter: split.rawFrontmatter,
      }),
    ).toBe(`---
title: "true"
code: "001"
---
# Hello
`);
  });

  it("quotes edited values that would change YAML type", () => {
    expect(
      joinCatDocument({
        hasFrontmatter: true,
        fields: [{ key: "draft", value: "true", rawValue: "false" }],
        body: "# Hello\n",
        rawFrontmatter: "draft: false",
      }),
    ).toBe(`---
draft: "true"
---
# Hello
`);
  });
});
