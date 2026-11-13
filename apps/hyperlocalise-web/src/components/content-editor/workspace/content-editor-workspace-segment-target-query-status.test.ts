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

import { isSegmentTargetQuerySettledWithoutData } from "./content-editor-workspace-segment-target-query-status";

describe("isSegmentTargetQuerySettledWithoutData", () => {
  it("treats an in-flight fetch as still pending", () => {
    expect(
      isSegmentTargetQuerySettledWithoutData({
        data: undefined,
        isFetching: true,
        isError: false,
        fetchStatus: "fetching",
      }),
    ).toBe(false);
  });

  it("treats a successful payload as hydrated, not failed", () => {
    expect(
      isSegmentTargetQuerySettledWithoutData({
        data: { text: "Bonjour" },
        isFetching: false,
        isError: false,
        fetchStatus: "idle",
      }),
    ).toBe(false);
  });

  it("treats an exhausted error as settled without data", () => {
    expect(
      isSegmentTargetQuerySettledWithoutData({
        data: undefined,
        isFetching: false,
        isError: true,
        fetchStatus: "idle",
      }),
    ).toBe(true);
  });

  it("treats a disabled idle observer as settled without data", () => {
    expect(
      isSegmentTargetQuerySettledWithoutData({
        data: undefined,
        isFetching: false,
        isError: false,
        fetchStatus: "idle",
      }),
    ).toBe(true);
  });

  it("keeps a paused fetch pending until the network resumes", () => {
    expect(
      isSegmentTargetQuerySettledWithoutData({
        data: undefined,
        isFetching: false,
        isError: false,
        fetchStatus: "paused",
      }),
    ).toBe(false);
  });
});
