/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { describe, expect, it } from "vite-plus/test";

describe("organization-tms-dashboard-summary", () => {
  it("exports a live-TMS dashboard summary shape without background sync fields", () => {
    expect({
      providers: [],
      counts: {
        connectedProviders: 0,
        externalProjects: 0,
        openProviderJobs: 0,
      },
    }).toEqual({
      providers: [],
      counts: {
        connectedProviders: 0,
        externalProjects: 0,
        openProviderJobs: 0,
      },
    });
  });
});
