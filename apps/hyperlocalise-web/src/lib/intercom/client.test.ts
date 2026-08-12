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

import { isErr, isOk } from "@/lib/primitives/result/results";

import { validateIntercomAccessToken } from "./client";

const mocks = vi.hoisted(() => {
  const identify = vi.fn();
  class IntercomError extends Error {
    statusCode: number;

    constructor(message: string, statusCode: number) {
      super(message);
      this.name = "IntercomError";
      this.statusCode = statusCode;
    }
  }

  class IntercomClient {
    admins = { identify };

    constructor(public options: { token: string; environment: string }) {}
  }

  return { identify, IntercomClient, IntercomError };
});

vi.mock("intercom-client", () => ({
  IntercomClient: mocks.IntercomClient,
  IntercomError: mocks.IntercomError,
}));

describe("intercom client", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("rejects blank access tokens before calling Intercom", async () => {
    const result = await validateIntercomAccessToken({
      accessToken: "  ",
      restEndpoint: "us",
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe("intercom_access_token_required");
    }
    expect(mocks.identify).not.toHaveBeenCalled();
  });

  it("validates tokens via admins.identify against the regional host", async () => {
    mocks.identify.mockResolvedValue({
      app: { name: "Acme Help" },
    });

    const result = await validateIntercomAccessToken({
      accessToken: "  dGVzdA==  ",
      restEndpoint: "eu",
    });

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toEqual({ appName: "Acme Help" });
    }
    expect(mocks.identify).toHaveBeenCalledOnce();
    expect(mocks.identify.mock.calls[0]?.[0]).toMatchObject({
      abortSignal: expect.any(AbortSignal),
    });
  });

  it("maps unauthorized Intercom responses to validation failure", async () => {
    mocks.identify.mockRejectedValue(new mocks.IntercomError("Unauthorized", 401));

    const result = await validateIntercomAccessToken({
      accessToken: "bad-token",
      restEndpoint: "us",
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe("intercom_connection_validation_failed");
      expect(result.error.message).toContain("rejected this access token");
    }
  });

  it("maps abort signals to intercom_validation_timeout", async () => {
    mocks.identify.mockRejectedValue(Object.assign(new Error("aborted"), { name: "AbortError" }));

    const result = await validateIntercomAccessToken({
      accessToken: "token",
      restEndpoint: "au",
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe("intercom_validation_timeout");
    }
  });
});
