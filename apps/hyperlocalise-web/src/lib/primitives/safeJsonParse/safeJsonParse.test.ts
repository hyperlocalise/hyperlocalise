/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { describe, expect, it } from "vite-plus/test";

import { isErr, isOk } from "../result/results";
import { safeJsonParse } from "./safeJsonParse";

describe("safeJsonParse", () => {
  it("returns Ok for valid JSON objects", () => {
    const result = safeJsonParse('{"name":"Alice","count":2}');

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toEqual({ name: "Alice", count: 2 });
    }
  });

  it("returns Ok for valid JSON arrays", () => {
    const result = safeJsonParse("[1,2,3]");

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toEqual([1, 2, 3]);
    }
  });

  it("returns Err for invalid JSON", () => {
    const result = safeJsonParse('{"name":');

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error).toBeInstanceOf(SyntaxError);
    }
  });

  it("returns Err for non-string input that JSON.parse rejects", () => {
    const result = safeJsonParse(undefined as unknown as string);

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error).toBeInstanceOf(SyntaxError);
    }
  });
});
