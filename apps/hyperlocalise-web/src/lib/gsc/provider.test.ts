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
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

vi.mock("@/lib/env", () => ({
  env: {
    GO_SVC_URL: "http://127.0.0.1:8080",
    WORKOS_COOKIE_PASSWORD: "test-cookie-password-at-least-32-characters",
  },
}));

import { createGoSvcGscProvider } from "./provider";

describe("createGoSvcGscProvider error mapping", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("maps auth, rate-limit, not-found, and validation failures", async () => {
    const cases = [
      {
        status: 401,
        body: { error: "gsc_auth_failed", message: "denied" },
        code: "gsc_auth_failed",
      },
      {
        status: 429,
        body: { error: "gsc_rate_limited", message: "slow down" },
        code: "gsc_rate_limited",
      },
      {
        status: 404,
        body: { error: "gsc_not_found", message: "missing" },
        code: "gsc_not_found",
      },
      {
        status: 400,
        body: { error: "gsc_validation_error", message: "bad request" },
        code: "gsc_validation_error",
      },
    ] as const;

    for (const testCase of cases) {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: testCase.status,
          json: async () => testCase.body,
        }),
      );

      const result = await createGoSvcGscProvider().listSites({ accessToken: "token" });
      expect(result).toMatchObject({
        ok: false,
        error: { code: testCase.code, message: testCase.body.message },
      });
    }
  });

  it("maps transport failures to provider_unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const result = await createGoSvcGscProvider().listSites({ accessToken: "token" });
    expect(result).toMatchObject({
      ok: false,
      error: { code: "provider_unavailable" },
    });
  });
});
