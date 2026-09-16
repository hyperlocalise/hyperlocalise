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
import { describe, expect, it, vi } from "vite-plus/test";

import { teamClient } from "./team-client";

describe("teamClient", () => {
  it("lists teams from go-svc", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ teams: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await teamClient.list({ param: { organizationSlug: "acme" } });

    expect(fetchMock).toHaveBeenCalledWith("/api/go-svc/v1/orgs/acme/teams", {
      method: "GET",
      credentials: "same-origin",
    });
  });
});
