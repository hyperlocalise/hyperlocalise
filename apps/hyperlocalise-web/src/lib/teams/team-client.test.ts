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

import { DEFAULT_GO_SVC_BASE_URL, GoSvcClient } from "@/lib/go-svc/go-svc-client";

import { createTeamClient } from "./team-client";

describe("createTeamClient", () => {
  it("lists teams from go-svc", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ teams: [] }));
    const teamClient = createTeamClient(
      new GoSvcClient({
        getAccessToken: () => "access-token",
        fetch: fetchMock as unknown as typeof fetch,
      }),
    );

    await teamClient.list({ param: { organizationSlug: "acme" } });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${DEFAULT_GO_SVC_BASE_URL}/v1/orgs/acme/teams`);
    expect(init.method).toBe("GET");
    expect(init.credentials).toBe("omit");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer access-token");
  });
});
