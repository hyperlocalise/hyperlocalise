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

import { Box } from "./box";
import { Column } from "./column";
import { Columns } from "./columns";
import { Grid } from "./grid";
import { Row } from "./row";
import { Rows } from "./rows";

describe("layout components", () => {
  it("maps Box props onto token classes", () => {
    const markup = renderToStaticMarkup(
      React.createElement(
        Box,
        { padding: "2u", background: "muted", borderRadius: "standard" },
        "Panel",
      ),
    );

    expect(markup).toContain('data-slot="box"');
    expect(markup).toContain("p-4");
    expect(markup).toContain("bg-muted");
    expect(markup).toContain("rounded-md");
    expect(markup).toContain("Panel");
  });

  it("ignores className and style even when they are passed at runtime", () => {
    const markup = renderToStaticMarkup(
      React.createElement(
        Box,
        { padding: "1u", className: "bg-red-500 text-lg", style: { color: "red" } } as never,
        "Safe",
      ),
    );

    expect(markup).toContain("p-2");
    expect(markup).not.toContain("bg-red-500");
    expect(markup).not.toContain("text-lg");
    expect(markup).not.toContain("color:red");
    expect(markup).not.toContain("color: red");
  });

  it("stacks Rows with token spacing", () => {
    const markup = renderToStaticMarkup(
      React.createElement(Rows, { spacing: "3u", align: "center" }, "Stacked"),
    );

    expect(markup).toContain('data-slot="rows"');
    expect(markup).toContain("flex-col");
    expect(markup).toContain("gap-6");
    expect(markup).toContain("items-center");
  });

  it("lays out Row horizontally", () => {
    const markup = renderToStaticMarkup(
      React.createElement(Row, { spacing: "1u", align: "spaceBetween" }, "Inline"),
    );

    expect(markup).toContain('data-slot="row"');
    expect(markup).toContain("gap-2");
    expect(markup).toContain("justify-between");
  });

  it("sizes Column fractions from Columns spacing", () => {
    const markup = renderToStaticMarkup(
      React.createElement(
        Columns,
        { spacing: "2u" },
        React.createElement(Column, { width: "1/3" }, "Narrow"),
        React.createElement(Column, { width: "2/3" }, "Wide"),
      ),
    );

    expect(markup).toContain('data-slot="columns"');
    expect(markup).toContain("--layout-columns-gap:1rem");
    expect(markup).toContain('data-width="1/3"');
    expect(markup).toContain('data-width="2/3"');
    expect(markup).toContain("flex-basis:calc(33.333");
    expect(markup).toContain("flex-basis:calc(66.666");
  });

  it("builds a Grid with column and spacing tokens", () => {
    const markup = renderToStaticMarkup(
      React.createElement(Grid, { columns: 3, spacing: "1u" }, "Cell"),
    );

    expect(markup).toContain('data-slot="grid"');
    expect(markup).toContain("grid-cols-3");
    expect(markup).toContain("gap-2");
  });
});
