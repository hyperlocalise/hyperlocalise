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

import { qaErrorsIncrease } from "./qa-scan-notifications";

describe("qaErrorsIncrease", () => {
  it("counts new errors against the previous successful scan", () => {
    expect(qaErrorsIncrease(5, 2)).toBe(3);
  });

  it("treats every error as new when there is no previous successful scan", () => {
    expect(qaErrorsIncrease(4, null)).toBe(4);
  });

  it("returns zero when errors stayed the same or went down", () => {
    expect(qaErrorsIncrease(2, 2)).toBe(0);
    expect(qaErrorsIncrease(1, 6)).toBe(0);
    expect(qaErrorsIncrease(0, null)).toBe(0);
  });
});
