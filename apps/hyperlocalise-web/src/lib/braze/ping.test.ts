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
  BRAZE_CLUSTER_UNREACHABLE,
  BRAZE_CREDENTIALS_INVALID,
  BRAZE_TEMPORARILY_UNAVAILABLE,
  BRAZE_REQUIRED_PERMISSION_PINGS,
  brazePermissionMissingError,
  pingBrazeRestCredentials,
} from "./ping";

function jsonOk() {
  return new Response(JSON.stringify({ count: 0 }), { status: 200 });
}

function requestUrl(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.href;
  }
  return input.url;
}

describe("pingBrazeRestCredentials", () => {
  it("accepts a key that can list every required Braze surface", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonOk());

    const result = await pingBrazeRestCredentials({
      apiKey: "braze-rest-key",
      restEndpoint: "iad-03",
      fetchImpl,
    });

    expect(isOk(result)).toBe(true);
    expect(fetchImpl.mock.calls.map(([url]) => requestUrl(url)).toSorted()).toEqual(
      BRAZE_REQUIRED_PERMISSION_PINGS.map(
        (check) => `https://rest.iad-03.braze.com${check.path}`,
      ).toSorted(),
    );
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining("/templates/email/list"),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer braze-rest-key",
        }),
      }),
    );
  });

  it("rejects an unauthorized key or cluster pair", async () => {
    const result = await pingBrazeRestCredentials({
      apiKey: "bad-key",
      restEndpoint: "fra-01",
      fetchImpl: async () =>
        new Response(JSON.stringify({ message: "Invalid API key" }), { status: 401 }),
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error).toEqual(BRAZE_CREDENTIALS_INVALID);
    }
  });

  it("rejects a key that is missing Content Blocks or campaign permissions", async () => {
    const result = await pingBrazeRestCredentials({
      apiKey: "limited-key",
      restEndpoint: "iad-03",
      fetchImpl: async (input) => {
        const url = requestUrl(input);
        if (url.includes("/templates/email/list") || url.includes("/campaigns/list")) {
          return jsonOk();
        }
        return new Response(JSON.stringify({ message: "Access Denied" }), { status: 403 });
      },
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error).toEqual(
        brazePermissionMissingError(["content_blocks.list", "canvas.list"]),
      );
    }
  });

  it("rejects a cluster that cannot be reached", async () => {
    const result = await pingBrazeRestCredentials({
      apiKey: "braze-rest-key",
      restEndpoint: "au-01",
      fetchImpl: async () => {
        throw new TypeError("fetch failed");
      },
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error).toEqual(BRAZE_CLUSTER_UNREACHABLE);
    }
  });

  it("rejects a temporary Braze HTTP failure instead of calling the cluster unreachable", async () => {
    const result = await pingBrazeRestCredentials({
      apiKey: "braze-rest-key",
      restEndpoint: "iad-03",
      fetchImpl: async () => new Response("rate limited", { status: 429 }),
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error).toEqual(BRAZE_TEMPORARILY_UNAVAILABLE);
    }
  });
});
