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

import { pingIterableCredentials } from "./ping";

describe("pingIterableCredentials", () => {
  it("accepts a key when templates list succeeds", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    const result = await pingIterableCredentials({
      apiKey: "test-key",
      region: "us",
      fetchImpl,
    });
    expect(result.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.iterable.com/api/templates?page=1&pageSize=1",
      expect.objectContaining({
        headers: expect.objectContaining({ "Api-Key": "test-key" }),
      }),
    );
  });

  it("rejects invalid credentials", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("", { status: 401 }));
    const result = await pingIterableCredentials({
      apiKey: "bad",
      region: "eu",
      fetchImpl,
    });
    expect(result.ok).toBe(false);
  });
});
