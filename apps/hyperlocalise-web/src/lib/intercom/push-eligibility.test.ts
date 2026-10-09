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
  isIntercomPushRunActive,
  shouldPreferKeyedIntercomArticleOverVariant,
} from "./push-eligibility";

describe("shouldPreferKeyedIntercomArticleOverVariant", () => {
  it("prefers later CAT approvals over an earlier uploaded file", () => {
    expect(
      shouldPreferKeyedIntercomArticleOverVariant({
        variantApprovedAt: new Date("2026-10-01T00:00:00.000Z"),
        latestKeyedApprovedAt: new Date("2026-10-02T00:00:00.000Z"),
      }),
    ).toBe(true);
  });

  it("keeps a later approved file over older keyed text", () => {
    expect(
      shouldPreferKeyedIntercomArticleOverVariant({
        variantApprovedAt: new Date("2026-10-03T00:00:00.000Z"),
        latestKeyedApprovedAt: new Date("2026-10-02T00:00:00.000Z"),
      }),
    ).toBe(false);
  });

  it("uses keyed text when no approved file exists", () => {
    expect(
      shouldPreferKeyedIntercomArticleOverVariant({
        variantApprovedAt: null,
        latestKeyedApprovedAt: new Date("2026-10-02T00:00:00.000Z"),
      }),
    ).toBe(true);
  });
});

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
