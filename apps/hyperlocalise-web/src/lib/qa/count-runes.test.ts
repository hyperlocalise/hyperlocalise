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

import { countRunes } from "./count-runes";

describe("countRunes", () => {
  it("counts Unicode code points instead of UTF-16 units", () => {
    expect(countRunes("Hi")).toBe(2);
    expect(countRunes("你好")).toBe(2);
    expect(countRunes("Hi😀")).toBe(3);
    expect("Hi😀".length).toBe(4);
  });
});
