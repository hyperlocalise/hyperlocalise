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

import { writeJsonSourceText } from "./json-source-text-writer";

const write = (
  text: string,
  texts: Record<string, string>,
  shouldWrite?: (key: string, fileText: string) => boolean,
) => {
  const outcome = writeJsonSourceText(Buffer.from(text, "utf8"), texts, shouldWrite);
  return outcome.kind === "file" ? outcome.content.toString("utf8") : outcome.kind;
};

describe("writeJsonSourceText", () => {
  it("changes only the edited string literals, keeping layout, escapes, order and empty containers", () => {
    const file =
      '﻿{\r\n\t"10": "Ten",\r\n\t"a": { "b": "Caf\\u00e9 \\/ menu", "c": "Old" },\r\n\t"empty": {},\r\n\t"list": [],\r\n\t"n": 1.0\r\n}';
    expect(write(file, { "a.c": 'New "quoted"' })).toBe(
      '﻿{\r\n\t"10": "Ten",\r\n\t"a": { "b": "Caf\\u00e9 \\/ menu", "c": "New \\"quoted\\"" },\r\n\t"empty": {},\r\n\t"list": [],\r\n\t"n": 1.0\r\n}',
    );
  });

  it("reads JSONC comments and trailing commas, and flattens lists the way the importer does", () => {
    const file =
      '{\n  // greeting\n  "items": ["One", "Two",],\n  /* block */ "title": "Home",\n}\n';
    expect(write(file, { "items[1]": "Second", title: "Start" })).toBe(
      '{\n  // greeting\n  "items": ["One", "Second",],\n  /* block */ "title": "Start",\n}\n',
    );
  });

  it("writes a FormatJS catalog's defaultMessage by message id", () => {
    const file = '{"cta": {"defaultMessage": "Buy", "description": "Button"}}';
    expect(write(file, { cta: "Buy now" })).toBe(
      '{"cta": {"defaultMessage": "Buy now", "description": "Button"}}',
    );
  });

  it("writes a Lottie animation's text by its layer path", () => {
    const file = '{"v":"5","layers":[{"t":{"d":{"k":[{"s":{"t":"Hello","f":"Inter"}}]}}}]}';
    expect(write(file, { "layers[0].t.d.k[0].s.t": "Hi" })).toBe(
      '{"v":"5","layers":[{"t":{"d":{"k":[{"s":{"t":"Hi","f":"Inter"}}]}}}]}',
    );
  });

  it("matches a key with surrounding spaces by the trimmed key the importer stores", () => {
    expect(write('{" title ": "Home"}', { title: "Start" })).toBe('{" title ": "Start"}');
  });

  it("leaves an ARB file's metadata alone", () => {
    const file = '{"@@locale": "en", "title": "Home", "@title": {"placeholders": {}}}';
    expect(write(file, { title: "Start" })).toBe(
      '{"@@locale": "en", "title": "Start", "@title": {"placeholders": {}}}',
    );
  });

  it("reports nothing to write, a key held back, and a file it can't read", () => {
    expect(write('{"title": "Home"}', { title: "Home", other: "x" })).toBe("unchanged");
    expect(write('{"title": "Home"}', { title: "Start" }, () => false)).toBe("unchanged");
    expect(write('{"title": "Home"', { title: "Start" })).toBe("unreadable");
    expect(write('["Home"]', { "[0]": "Start" })).toBe("unreadable");
  });
});
