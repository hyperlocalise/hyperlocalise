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
  extractI18nextNestingPlaceholders,
  extractInterpolationPlaceholders,
  maskInterpolationPlaceholders,
} from "./interpolation-placeholders";

describe("interpolation placeholders", () => {
  it("extracts i18next names, formats, and unescape prefixes", () => {
    expect(extractInterpolationPlaceholders("Hi {{name, uppercase}} and {{- html}}")).toEqual([
      expect.objectContaining({ name: "name", literal: "{{name, uppercase}}" }),
      expect.objectContaining({ name: "html", literal: "{{-html}}" }),
    ]);
  });

  it("skips nested ICU option braces", () => {
    expect(
      extractInterpolationPlaceholders(
        "{gender, select, male {{count, plural, one {#} other {#}}} other {x}}",
      ),
    ).toEqual([]);
  });

  it("masks interpolations without shifting later offsets", () => {
    const message = "A {{name}} Z";
    const spans = extractInterpolationPlaceholders(message);
    const masked = maskInterpolationPlaceholders(message, spans);

    expect(masked).toBe(`A ${" ".repeat("{{name}}".length)} Z`);
    expect(masked.length).toBe(message.length);
  });

  it("extracts i18next nesting calls", () => {
    expect(extractI18nextNestingPlaceholders("See $t(help.link)")).toEqual(["$t(help.link)"]);
  });
});
