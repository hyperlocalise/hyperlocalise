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

import {
  joinContentEditorDocument,
  splitContentEditorDocument,
} from "./content-editor-document-frontmatter";

describe("splitContentEditorDocument", () => {
  it("returns the full text as body when there is no frontmatter", () => {
    expect(splitContentEditorDocument("# Hello\n\nBody.\n")).toEqual({
      fields: [],
      body: "# Hello\n\nBody.\n",
      hasFrontmatter: false,
      rawFrontmatter: "",
    });
  });

  it("extracts scalar frontmatter fields and leaves the body for TipTap", () => {
    expect(
      splitContentEditorDocument("---\ntitle: Docs\ndescription: Intro page\n---\n\n# Hello\n"),
    ).toEqual({
      fields: [
        { key: "title", value: "Docs", rawValue: "Docs" },
        { key: "description", value: "Intro page", rawValue: "Intro page" },
      ],
      body: "\n# Hello\n",
      hasFrontmatter: true,
      rawFrontmatter: "title: Docs\ndescription: Intro page",
    });
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
    expect(splitContentEditorDocument(text)).toEqual({
      fields: [{ key: "title", value: "Docs", rawValue: "Docs" }],
      body: "\n# Hello\n",
      hasFrontmatter: true,
      rawFrontmatter:
        "title: Docs\n# keep this comment\ntags:\n  - one\n  - two\nauthors:\n  - name: Ada\ndescription: |\n  Multi-line",
    });
  });
});

describe("joinContentEditorDocument", () => {
  it("reconstructs a markdown file from fields and body", () => {
    expect(
      joinContentEditorDocument({
        hasFrontmatter: true,
        fields: [{ key: "title", value: "Docs" }],
        body: "# Hello\n",
      }),
    ).toBe("---\ntitle: Docs\n---\n# Hello\n");
  });

  it("leaves body-only documents unchanged", () => {
    expect(
      joinContentEditorDocument({
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
      joinContentEditorDocument({
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
    const split = splitContentEditorDocument(`---\n${rawFrontmatter}\n---\n\n# Hello\n`);
    expect(
      joinContentEditorDocument({
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
      joinContentEditorDocument({
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

  it("decodes escaped newlines in double-quoted YAML scalars", () => {
    const rawFrontmatter = `title: "Line\\nOne"`;
    const split = splitContentEditorDocument(`---\n${rawFrontmatter}\n---\n\n# Hello\n`);
    expect(split.fields).toEqual([{ key: "title", value: "Line\nOne", rawValue: '"Line\\nOne"' }]);
    expect(
      joinContentEditorDocument({
        hasFrontmatter: true,
        fields: split.fields,
        body: "# Hello\n",
        rawFrontmatter: split.rawFrontmatter,
      }),
    ).toBe(`---
title: "Line\\nOne"
---
# Hello
`);
  });

  it("rewrites an edited multiline YAML scalar with JSON-style escapes", () => {
    expect(
      joinContentEditorDocument({
        hasFrontmatter: true,
        fields: [{ key: "title", value: "Line\nTwo", rawValue: '"Line\\nOne"' }],
        body: "# Hello\n",
        rawFrontmatter: `title: "Line\\nOne"`,
      }),
    ).toBe(`---
title: "Line\\nTwo"
---
# Hello
`);
  });

  it("unescapes doubled single quotes in YAML scalars", () => {
    const rawFrontmatter = `title: 'It''s fine'`;
    const split = splitContentEditorDocument(`---\n${rawFrontmatter}\n---\n\n# Hello\n`);
    expect(split.fields).toEqual([{ key: "title", value: "It's fine", rawValue: "'It''s fine'" }]);
    expect(
      joinContentEditorDocument({
        hasFrontmatter: true,
        fields: split.fields,
        body: "# Hello\n",
        rawFrontmatter: split.rawFrontmatter,
      }),
    ).toBe(`---
title: 'It''s fine'
---
# Hello
`);
  });
});
