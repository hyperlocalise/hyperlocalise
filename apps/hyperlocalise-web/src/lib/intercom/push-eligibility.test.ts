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

import { isIntercomPushRunActive } from "./push-eligibility";

describe("isIntercomPushRunActive", () => {
  it("is true only for queued or running push_approved runs", () => {
    expect(
      isIntercomPushRunActive([
        { status: "queued", inputSnapshot: { operation: "push_approved" } },
      ]),
    ).toBe(true);
    expect(
      isIntercomPushRunActive([
        { status: "running", inputSnapshot: { operation: "push_approved" } },
      ]),
    ).toBe(true);
    expect(
      isIntercomPushRunActive([{ status: "queued", inputSnapshot: { operation: "import" } }]),
    ).toBe(false);
    expect(
      isIntercomPushRunActive([
        { status: "completed", inputSnapshot: { operation: "push_approved" } },
      ]),
    ).toBe(false);
  });
});
