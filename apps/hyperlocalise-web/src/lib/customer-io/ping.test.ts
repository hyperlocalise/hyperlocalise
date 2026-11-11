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

import { isErr, isOk } from "@/lib/primitives/result/results";

import {
  CUSTOMER_IO_CREDENTIALS_INVALID,
  CUSTOMER_IO_REGION_UNREACHABLE,
  CUSTOMER_IO_TEMPORARILY_UNAVAILABLE,
  pingCustomerIoCredentials,
} from "./ping";

describe("pingCustomerIoCredentials", () => {
  it("accepts a key that can list broadcasts", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response("{}", { status: 200 }));

    const result = await pingCustomerIoCredentials({
      apiKey: "cio-app-key",
      region: "us",
      fetchImpl,
    });

    expect(isOk(result)).toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.customer.io/v1/broadcasts?limit=1",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer cio-app-key",
        }),
      }),
    );
  });

  it("targets the EU region when configured", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response("{}", { status: 200 }));

    await pingCustomerIoCredentials({ apiKey: "cio-app-key", region: "eu", fetchImpl });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api-eu.customer.io/v1/broadcasts?limit=1",
      expect.anything(),
    );
  });

  it("checks every localizable resource kind", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response("{}", { status: 200 }));

    const result = await pingCustomerIoCredentials({
      apiKey: "cio-app-key",
      region: "us",
      fetchImpl,
    });

    expect(isOk(result)).toBe(true);
    const urls = fetchImpl.mock.calls.map(([url]) => url);
    expect(urls).toEqual([
      "https://api.customer.io/v1/broadcasts?limit=1",
      "https://api.customer.io/v1/campaigns?limit=1",
      "https://api.customer.io/v1/newsletters?limit=1",
      "https://api.customer.io/v1/transactional?limit=1",
    ]);
  });

  it("rejects an unauthorized key", async () => {
    const result = await pingCustomerIoCredentials({
      apiKey: "bad-key",
      region: "us",
      fetchImpl: async () => new Response("{}", { status: 401 }),
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error).toEqual(CUSTOMER_IO_CREDENTIALS_INVALID);
    }
  });

  it("reports unreachable regions and transient failures", async () => {
    const unreachable = await pingCustomerIoCredentials({
      apiKey: "cio-app-key",
      region: "us",
      fetchImpl: async () => {
        throw new Error("boom");
      },
    });
    expect(isErr(unreachable)).toBe(true);
    if (isErr(unreachable)) {
      expect(unreachable.error).toEqual(CUSTOMER_IO_REGION_UNREACHABLE);
    }

    const transient = await pingCustomerIoCredentials({
      apiKey: "cio-app-key",
      region: "us",
      fetchImpl: async () => new Response("{}", { status: 503 }),
    });
    expect(isErr(transient)).toBe(true);
    if (isErr(transient)) {
      expect(transient.error).toEqual(CUSTOMER_IO_TEMPORARILY_UNAVAILABLE);
    }
  });
});
