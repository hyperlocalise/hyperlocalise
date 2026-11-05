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

const cookiePassword = "this-is-a-test-cookie-password-at-least-32-characters";

async function loadServiceToken(input?: { cookiePassword?: string }) {
  vi.resetModules();
  vi.doMock("@/lib/env", () => ({
    env: { WORKOS_COOKIE_PASSWORD: input?.cookiePassword },
  }));
  return import("./go-svc-service-token");
}

describe("go-svc service token", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("@/lib/env");
  });

  it("mints the HMAC hex digest go-svc expects", async () => {
    const { mintGoSvcServiceToken, GO_SVC_SERVICE_TOKEN_MESSAGE } = await loadServiceToken();
    const { createHmac } = await import("node:crypto");

    expect(mintGoSvcServiceToken(cookiePassword)).toBe(
      createHmac("sha256", cookiePassword).update(GO_SVC_SERVICE_TOKEN_MESSAGE).digest("hex"),
    );
  });

  it("rejects requests when the cookie password is missing", async () => {
    const { verifyGoSvcServiceToken, GO_SVC_SERVICE_TOKEN_HEADER, mintGoSvcServiceToken } =
      await loadServiceToken({ cookiePassword: undefined });

    const request = new Request("https://hyperlocalise.test/api/internal/tms/access-token", {
      headers: { [GO_SVC_SERVICE_TOKEN_HEADER]: mintGoSvcServiceToken(cookiePassword) },
    });

    expect(verifyGoSvcServiceToken(request)).toEqual({ ok: false, reason: "misconfigured" });
  });

  it("rejects missing or wrong tokens", async () => {
    const { verifyGoSvcServiceToken, GO_SVC_SERVICE_TOKEN_HEADER } = await loadServiceToken({
      cookiePassword,
    });

    expect(
      verifyGoSvcServiceToken(
        new Request("https://hyperlocalise.test/api/internal/tms/access-token"),
      ),
    ).toEqual({ ok: false, reason: "unauthorized" });

    expect(
      verifyGoSvcServiceToken(
        new Request("https://hyperlocalise.test/api/internal/tms/access-token", {
          headers: { [GO_SVC_SERVICE_TOKEN_HEADER]: "not-the-token" },
        }),
      ),
    ).toEqual({ ok: false, reason: "unauthorized" });
  });

  it("accepts the matching HMAC", async () => {
    const { verifyGoSvcServiceToken, GO_SVC_SERVICE_TOKEN_HEADER, mintGoSvcServiceToken } =
      await loadServiceToken({ cookiePassword });

    const request = new Request("https://hyperlocalise.test/api/internal/tms/access-token", {
      headers: { [GO_SVC_SERVICE_TOKEN_HEADER]: mintGoSvcServiceToken(cookiePassword) },
    });

    expect(verifyGoSvcServiceToken(request)).toEqual({ ok: true });
  });
});
