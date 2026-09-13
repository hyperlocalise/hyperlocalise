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

import { queryRowsFromGsc, seriesFromDateRows, summarizeGscRows } from "./performance";

describe("gsc performance helpers", () => {
  it("weights average position by impressions", () => {
    expect(
      summarizeGscRows([
        { clicks: 10, impressions: 100, ctr: 0.1, position: 4 },
        { clicks: 5, impressions: 300, ctr: 0.016, position: 12 },
      ]),
    ).toEqual({
      clicks: 15,
      impressions: 400,
      ctr: 0.0375,
      position: 10,
    });
  });

  it("maps dimension keys onto query and date rows", () => {
    expect(
      queryRowsFromGsc([{ keys: ["traduction ia"], clicks: 8, impressions: 80, ctr: 0.1, position: 6 }]),
    ).toEqual([{ query: "traduction ia", clicks: 8, impressions: 80, ctr: 0.1, position: 6 }]);
    expect(
      seriesFromDateRows([{ keys: ["2026-09-01"], clicks: 3, impressions: 40, ctr: 0.075, position: 9 }]),
    ).toEqual([{ date: "2026-09-01", clicks: 3, impressions: 40, ctr: 0.075, position: 9 }]);
  });
});
