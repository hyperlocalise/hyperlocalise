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

import { isErr, isOk } from "@/lib/primitives/result/results";

import {
  LOOPS_CREDENTIALS_INVALID,
  LOOPS_TEMPORARILY_UNAVAILABLE,
  pingLoopsCredentials,
} from "./ping";

describe("pingLoopsCredentials", () => {
  it("accepts a key that can read the Loops API key", async () => {
    const fetchImpl = async () =>
      new Response(JSON.stringify({ key: { name: "CI" } }), { status: 200 });

    const result = await pingLoopsCredentials({ apiKey: "loops-key", fetchImpl });

    expect(isOk(result)).toBe(true);
  });

  it("sends the key as a bearer token to the api-key endpoint", async () => {
    let seenUrl = "";
    let seenAuth = "";
    const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
      seenUrl = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      seenAuth = new Headers(init?.headers).get("authorization") ?? "";
      return new Response("{}", { status: 200 });
    };

    await pingLoopsCredentials({ apiKey: "  loops-key  ", fetchImpl });

    expect(seenUrl).toBe("https://app.loops.so/api/v1/api-key");
    expect(seenAuth).toBe("Bearer loops-key");
  });

  it("rejects an unauthorized key", async () => {
    const result = await pingLoopsCredentials({
      apiKey: "bad-key",
      fetchImpl: async () => new Response(JSON.stringify({ error: "nope" }), { status: 401 }),
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error).toEqual(LOOPS_CREDENTIALS_INVALID);
    }
  });

  it("treats rate limits and Loops outages as temporary", async () => {
    for (const status of [429, 500]) {
      const result = await pingLoopsCredentials({
        apiKey: "loops-key",
        fetchImpl: async () => new Response("busy", { status }),
      });

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error).toEqual(LOOPS_TEMPORARILY_UNAVAILABLE);
      }
    }
  });

  it("treats a network failure as temporary", async () => {
    const result = await pingLoopsCredentials({
      apiKey: "loops-key",
      fetchImpl: async () => {
        throw new TypeError("fetch failed");
      },
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error).toEqual(LOOPS_TEMPORARILY_UNAVAILABLE);
    }
  });
});
