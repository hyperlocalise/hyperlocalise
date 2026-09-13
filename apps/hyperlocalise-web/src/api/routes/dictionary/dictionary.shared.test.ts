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

import { isUniqueViolation } from "./dictionary.shared";

describe("isUniqueViolation", () => {
  it("accepts Postgres unique-violation codes on the error or its cause", () => {
    const direct = Object.assign(new Error("duplicate key"), { code: "23505" });
    const wrapped = new Error("insert failed", {
      cause: Object.assign(new Error("duplicate key"), { code: "23505" }),
    });

    expect(isUniqueViolation(direct)).toBe(true);
    expect(isUniqueViolation(wrapped)).toBe(true);
  });

  it("rejects timeouts and other operational failures", () => {
    expect(isUniqueViolation(new Error("connection timeout"))).toBe(false);
    expect(isUniqueViolation(Object.assign(new Error("deadlock"), { code: "40P01" }))).toBe(false);
    expect(isUniqueViolation("23505")).toBe(false);
  });
});
