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

import { collectBlogPostStylesCss } from "./blog-stylesheets";

describe("collectBlogPostStylesCss", () => {
  it("returns empty css when the sdk cannot read design manager files", async () => {
    await expect(collectBlogPostStylesCss({}, { templatePath: "theme/blog.css" })).resolves.toBe(
      "",
    );
  });

  it("loads direct css files and attached stylesheet paths", async () => {
    const requested: string[] = [];
    const css = await collectBlogPostStylesCss(
      {
        apiRequest: async ({ path }) => {
          requested.push(path);
          if (path.endsWith("theme/blog.css")) {
            return { ok: true, text: async () => "body { margin: 0; }" };
          }
          if (path.endsWith("theme/extra.css")) {
            return { ok: true, text: async () => ".hero { color: blue; }" };
          }
          return { ok: false, text: async () => "" };
        },
      },
      {
        templatePath: "theme/blog.css",
        attachedStylesheets: [{ path: "theme/extra.css" }],
      },
    );
    expect(css).toContain("body { margin: 0; }");
    expect(css).toContain(".hero { color: blue; }");
    expect(requested.some((path) => path.includes("published/content/theme/blog.css"))).toBe(true);
  });

  it("follows require_css in hubL templates and inlines require_css blocks", async () => {
    const css = await collectBlogPostStylesCss(
      {
        apiRequest: async ({ path }) => {
          if (path.endsWith("theme/templates/blog-post.html")) {
            return {
              ok: true,
              text: async () =>
                [
                  '{% require_css "theme/blog.css" %}',
                  "{% require_css %}",
                  ".inline { font-weight: bold; }",
                  "{% end_require_css %}",
                ].join("\n"),
            };
          }
          if (path.endsWith("theme/blog.css")) {
            return { ok: true, text: async () => "article { padding: 1rem; }" };
          }
          return { ok: false, text: async () => "" };
        },
      },
      { templatePath: "theme/templates/blog-post.html" },
    );
    expect(css).toContain("article { padding: 1rem; }");
    expect(css).toContain(".inline { font-weight: bold; }");
  });

  it("unwraps json source payloads from the design manager API", async () => {
    const css = await collectBlogPostStylesCss(
      {
        apiRequest: async () => ({
          ok: true,
          text: async () => JSON.stringify({ source: "h1 { color: green; }" }),
        }),
      },
      { attachedStylesheets: ["theme/from-json.css"] },
    );
    expect(css).toBe("h1 { color: green; }");
  });
});
