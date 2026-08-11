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

import { serializeWorkosErrorForLog } from "./serialize-workos-error-for-log";

describe("serializeWorkosErrorForLog", () => {
  it("captures WorkOS request exception fields", () => {
    const error = new Error("The role is invalid");
    error.name = "UnprocessableEntityException";
    Object.assign(error, {
      code: "invalid_role",
      requestID: "req_123",
    });

    expect(serializeWorkosErrorForLog(error)).toEqual({
      errorName: "UnprocessableEntityException",
      errorMessage: "The role is invalid",
      workosErrorCode: "invalid_role",
      workosRequestId: "req_123",
    });
  });

  it("returns unknown_error for non-error values", () => {
    expect(serializeWorkosErrorForLog("boom")).toEqual({ errorName: "unknown_error" });
  });
});
