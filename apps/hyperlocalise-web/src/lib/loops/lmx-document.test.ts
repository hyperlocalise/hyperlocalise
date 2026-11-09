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
import type { Theme } from "loops";

import { extractLoopsTextSegments, parseLoopsEmailEnvelope } from "./html-envelope";
import { protectLoopsVariables } from "./variables";
import {
  extractLoopsContentBlocks,
  parseLoopsStyleTag,
  renderLoopsEmailDocument,
  renderLoopsThemeCss,
  resolveLoopsThemeStyles,
} from "./lmx-document";

const LMX = [
  '<Style themeId="st_123" bodyColor="#ffffff" />',
  "<H1>Welcome {contact.firstName}</H1>",
  "<Paragraph>Thanks for trying Loops.</Paragraph>",
  '<Paragraph>Read the <Text fontWeight="bold">docs</Text> first.</Paragraph>',
  "<Section><Paragraph>Nested block.</Paragraph></Section>",
  '<Button href="https://example.com/start">Open account</Button>',
  '<Image src="https://example.com/logo.png" alt="Logo" />',
  "<Divider />",
  "<OrderedList><ListItem>First step</ListItem><ListItem>Second step</ListItem></OrderedList>",
  "<UnorderedList><ListItem>A note</ListItem></UnorderedList>",
  '<Component componentId="header" />',
  '<Component componentId="missing" />',
].join("");

function theme(overrides: Partial<Theme> = {}): Theme {
  return {
    id: "st_123",
    name: "Default",
    styles: {
      backgroundColor: "#f1f5f9",
      bodyColor: "#ffffff",
      textBaseColor: "#111827",
      buttonBodyColor: "#2b59c3",
      buttonTextColor: "#ffffff",
      heading1FontSize: 34,
    },
    isDefault: true,
    createdAt: "2026-10-29T00:00:00.000Z",
    updatedAt: "2026-10-29T00:00:00.000Z",
    ...overrides,
  };
}

describe("extractLoopsContentBlocks", () => {
  it("maps blocks with hrefs and list order", () => {
    const blocks = extractLoopsContentBlocks(LMX);
    const texts = blocks.filter((block) => block.kind === "text");
    expect(texts.map((block) => (block.kind === "text" ? block.block : null))).toEqual([
      "h1",
      "paragraph",
      "paragraph",
      "paragraph",
      "paragraph",
      "paragraph",
      "button",
      "listItem",
      "listItem",
      "listItem",
    ]);
    const button = texts.find((block) => block.kind === "text" && block.block === "button");
    expect(button).toMatchObject({ href: "https://example.com/start" });
    const items = texts.filter((block) => block.kind === "text" && block.block === "listItem");
    expect(items.map((item) => (item.kind === "text" ? item.ordered : null))).toEqual([
      true,
      true,
      false,
    ]);
    expect(blocks.filter((block) => block.kind === "image")).toHaveLength(1);
    expect(blocks.filter((block) => block.kind === "divider")).toHaveLength(1);
    expect(blocks.filter((block) => block.kind === "component")).toHaveLength(2);
  });

  it("matches the legacy segment extractor run for run", () => {
    const texts = extractLoopsContentBlocks(LMX)
      .filter((block) => block.kind === "text")
      .map((block) => (block.kind === "text" ? block.text : ""));
    expect(texts).toEqual(extractLoopsTextSegments(LMX));
  });
});

describe("parseLoopsStyleTag", () => {
  it("reads themeId and coerces numeric overrides", () => {
    expect(parseLoopsStyleTag(LMX)).toEqual({
      themeId: "st_123",
      overrides: { bodyColor: "#ffffff" },
    });
    expect(
      parseLoopsStyleTag('<Style heading1FontSize="34" bodyColor="#fff" />').overrides,
    ).toEqual({ heading1FontSize: 34, bodyColor: "#fff" });
  });

  it("returns empty overrides without a Style tag", () => {
    expect(parseLoopsStyleTag("<Paragraph>Hi</Paragraph>")).toEqual({ overrides: {} });
  });
});

describe("resolveLoopsThemeStyles", () => {
  it("prefers the named theme and lets inline overrides win", () => {
    const styles = resolveLoopsThemeStyles({
      style: { themeId: "st_123", overrides: { bodyColor: "#000000" } },
      themes: [theme(), theme({ id: "other", isDefault: false, styles: {} })],
    });
    expect(styles).toMatchObject({
      backgroundColor: "#f1f5f9",
      bodyColor: "#000000",
      buttonBodyColor: "#2b59c3",
    });
  });

  it("falls back to the default theme and then to empty styles", () => {
    expect(resolveLoopsThemeStyles({ style: { overrides: {} }, themes: [theme()] }).bodyColor).toBe(
      "#ffffff",
    );
    expect(resolveLoopsThemeStyles({ style: { overrides: {} }, themes: [] })).toEqual({});
  });
});

describe("renderLoopsThemeCss", () => {
  it("emits page, body, heading, and button rules", () => {
    const css = renderLoopsThemeCss(
      resolveLoopsThemeStyles({ style: parseLoopsStyleTag(LMX), themes: [theme()] }),
    );
    expect(css).toContain("background-color:#f1f5f9");
    expect(css).toContain("background-color:#ffffff");
    expect(css).toContain("font-size:34px");
    expect(css).toContain("background-color:#2b59c3");
  });
});

describe("renderLoopsEmailDocument", () => {
  const components = new Map([["header", "<Paragraph>Header text</Paragraph>"]]);

  function render() {
    return renderLoopsEmailDocument({
      subject: "Welcome",
      previewText: "Get started",
      lmx: LMX,
      styles: resolveLoopsThemeStyles({ style: parseLoopsStyleTag(LMX), themes: [theme()] }),
      components,
    });
  }

  it("keeps segment markers in order for the existing parser", () => {
    const { html, segments, tokensBySegment } = render();
    expect(segments).toEqual(extractLoopsTextSegments(LMX));
    expect(tokensBySegment).toHaveLength(segments.length);
    const parsed = parseLoopsEmailEnvelope(html);
    expect(parsed.subject).toBe("Welcome");
    expect(parsed.previewText).toBe("Get started");
    expect(parsed.segments).toEqual(segments.map((segment) => protectLoopsVariables(segment).text));
  });

  it("renders structure, links, images, and expanded components", () => {
    const { html } = render();
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("<style>");
    expect(html).toContain('href="https://example.com/start"');
    expect(html).toContain('src="https://example.com/logo.png"');
    expect(html).toContain("<ol");
    expect(html).toContain("<ul");
    expect(html).toContain("Header text");
    expect(html).not.toContain("missing");
    // Static component text renders without a segment marker.
    expect(html.match(/data-hl-loops-field="segment-\d+"/g)).toHaveLength(
      extractLoopsTextSegments(LMX).length,
    );
  });

  it("renders without styles when the theme cannot be resolved", () => {
    const { html, segments } = renderLoopsEmailDocument({
      subject: "Welcome",
      lmx: "<Paragraph>Hi</Paragraph>",
    });
    expect(segments).toEqual(["Hi"]);
    expect(parseLoopsEmailEnvelope(html).segments).toEqual(["Hi"]);
  });
});
