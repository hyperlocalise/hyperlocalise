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

describe("cron auth", () => {
  it("accepts bearer tokens that match CRON_SECRET", async () => {
    vi.resetModules();
    vi.doMock("@/lib/env", () => ({
      env: {
        CRON_SECRET: "cron-secret",
      },
    }));

    const { verifyCronRequest } = await import("./cron-auth");

    const request = new Request("http://localhost/api/cron/example", {
      headers: {
        authorization: "Bearer cron-secret",
      },
    });

    expect(verifyCronRequest(request)).toEqual({ ok: true });
  });

  it("rejects requests when CRON_SECRET is not configured", async () => {
    vi.resetModules();
    vi.doMock("@/lib/env", () => ({
      env: {
        CRON_SECRET: undefined,
      },
    }));

    const { verifyCronRequest } = await import("./cron-auth");

    const request = new Request("http://localhost/api/cron/example", {
      headers: {
        authorization: "Bearer cron-secret",
      },
    });

    expect(verifyCronRequest(request)).toEqual({ ok: false, reason: "misconfigured" });
  });
});
