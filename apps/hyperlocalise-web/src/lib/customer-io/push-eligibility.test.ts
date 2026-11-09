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

import { isCustomerIoPushRunActive } from "./push-eligibility";

describe("isCustomerIoPushRunActive", () => {
  it("is true only for queued or running push_approved runs", () => {
    expect(
      isCustomerIoPushRunActive([
        {
          status: "queued",
          inputSnapshot: { operation: "push_approved" },
        },
      ]),
    ).toBe(true);
    expect(
      isCustomerIoPushRunActive([
        {
          status: "running",
          inputSnapshot: { operation: "push_approved" },
        },
      ]),
    ).toBe(true);
    expect(
      isCustomerIoPushRunActive([{ status: "queued", inputSnapshot: { operation: "import" } }]),
    ).toBe(false);
    expect(
      isCustomerIoPushRunActive([
        {
          status: "succeeded",
          inputSnapshot: { operation: "push_approved" },
        },
      ]),
    ).toBe(false);
    expect(isCustomerIoPushRunActive([{ status: "queued", inputSnapshot: {} }])).toBe(false);
  });
});
