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
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import {
  Text,
  Title,
  TypographyH1,
  TypographyH2,
  TypographyInlineCode,
  TypographyLead,
  TypographyMuted,
  TypographyP,
  TypographySmall,
} from "./typography";

describe("typography components", () => {
  it("maps Text token props onto size, tone, alignment, and weight classes", () => {
    const markup = renderToStaticMarkup(
      React.createElement(
        Text,
        {
          size: "small",
          tone: "subtle",
          alignment: "center",
          weight: "medium",
          wrapStyle: "pretty",
          capitalization: "uppercase",
        },
        "Review queue",
      ),
    );

    expect(markup).toContain('data-slot="text"');
    expect(markup).toContain('data-size="small"');
    expect(markup).toContain("text-sm");
    expect(markup).toContain("text-muted-foreground");
    expect(markup).toContain("text-center");
    expect(markup).toContain("font-medium");
    expect(markup).toContain("text-pretty");
    expect(markup).toContain("uppercase");
    expect(markup).toContain("Review queue");
    expect(markup).toMatch(/^<p /);
  });

  it("renders Title with a heading tag inferred from size", () => {
    const markup = renderToStaticMarkup(
      React.createElement(Title, { size: "large", tone: "content" }, "Jobs"),
    );

    expect(markup).toContain('data-slot="title"');
    expect(markup).toContain('data-size="large"');
    expect(markup).toMatch(/^<h2 /);
    expect(markup).toContain("font-heading");
    expect(markup).toContain("text-2xl");
    expect(markup).toContain("text-foreground");
    expect(markup).toContain("Jobs");
  });

  it("keeps the existing heading defaults on Typography wrappers", () => {
    const h1 = renderToStaticMarkup(React.createElement(TypographyH1, {}, "Ship globally"));
    const h2 = renderToStaticMarkup(React.createElement(TypographyH2, {}, "Review queue"));
    const lead = renderToStaticMarkup(React.createElement(TypographyLead, {}, "Lead copy"));
    const muted = renderToStaticMarkup(React.createElement(TypographyMuted, {}, "Metadata"));
    const small = renderToStaticMarkup(React.createElement(TypographySmall, {}, "Caption"));

    expect(h1).toMatch(/^<h1 /);
    expect(h1).toContain("font-heading");
    expect(h1).toContain("text-3xl");
    expect(h1).toContain("text-balance");
    expect(h2).toMatch(/^<h2 /);
    expect(h2).toContain("pb-2");
    expect(lead).toContain("text-xl");
    expect(lead).toContain("text-muted-foreground");
    expect(muted).toMatch(/^<div /);
    expect(muted).toContain("text-sm");
    expect(muted).toContain("text-muted-foreground");
    expect(small).toContain("font-medium");
  });

  it("lets wrappers override token props without className", () => {
    const markup = renderToStaticMarkup(
      React.createElement(
        TypographyP,
        { size: "small", tone: "critical", alignment: "end", lineClamp: 2 },
        "Provider failed",
      ),
    );

    expect(markup).toMatch(/^<p /);
    expect(markup).toContain("text-sm");
    expect(markup).toContain("text-destructive");
    expect(markup).toContain("text-end");
    expect(markup).toContain("line-clamp-2");
    expect(markup).not.toContain("alignment=");
    expect(markup).not.toContain("tone=");
    expect(markup).not.toContain("lineClamp=");
  });

  it("clamps a single line with truncate and still accepts className", () => {
    const markup = renderToStaticMarkup(
      React.createElement(
        Text,
        { lineClamp: 1, className: "mt-2", tagName: "span" },
        "A very long filename.json",
      ),
    );

    expect(markup).toMatch(/^<span /);
    expect(markup).toContain("truncate");
    expect(markup).toContain("mt-2");
  });

  it("uses an inline clamp style when lineClamp is beyond the utility scale", () => {
    const markup = renderToStaticMarkup(
      React.createElement(Title, { size: "small", lineClamp: 8 }, "Overflowing title"),
    );

    expect(markup).toContain("overflow-hidden");
    expect(markup).toContain("-webkit-line-clamp:8");
  });

  it("does not leak token props onto inline code", () => {
    const markup = renderToStaticMarkup(
      React.createElement(
        TypographyInlineCode,
        { tone: "subtle", alignment: "start" },
        "provider.sync()",
      ),
    );

    expect(markup).toContain('data-slot="inline-code"');
    expect(markup).toContain("text-muted-foreground");
    expect(markup).not.toContain("tone=");
    expect(markup).not.toContain("alignment=");
  });

  it("renders a floating blob on Title", () => {
    const markup = renderToStaticMarkup(React.createElement(Title, { floatingBlob: true }, "New"));

    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain("var(--color-red-600)");
  });
});
