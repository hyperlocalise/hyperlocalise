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

import { isMailchimpRemoteCopyNewer } from "./existing-translation-policy";

describe("isMailchimpRemoteCopyNewer", () => {
  it("treats missing timestamps as newer", () => {
    const pushedAt = new Date("2026-10-01T00:00:00.000Z");
    expect(isMailchimpRemoteCopyNewer({ lastPushedAt: pushedAt, copyUpdatedAt: null })).toBe(
      true,
    );
    expect(
      isMailchimpRemoteCopyNewer({
        lastPushedAt: null,
        copyUpdatedAt: "2026-10-02T00:00:00.000Z",
      }),
    ).toBe(true);
  });

  it("compares remote edit time against last push", () => {
    const pushedAt = new Date("2026-10-01T00:00:00.000Z");
    expect(
      isMailchimpRemoteCopyNewer({
        lastPushedAt: pushedAt,
        copyUpdatedAt: "2026-10-02T00:00:00.000Z",
      }),
    ).toBe(true);
    expect(
      isMailchimpRemoteCopyNewer({
        lastPushedAt: pushedAt,
        copyUpdatedAt: "2026-10-01T00:01:00.000Z",
      }),
    ).toBe(false);
  });
});
