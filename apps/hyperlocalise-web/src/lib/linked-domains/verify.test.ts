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

import { verifyLinkedDomainChallenge } from "./verify";
import { isErr, isOk } from "@/lib/primitives/result/results";

describe("verifyLinkedDomainChallenge", () => {
  it("verifies DNS TXT via injectable resolver", async () => {
    const result = await verifyLinkedDomainChallenge({
      method: "dns_txt",
      domainKey: "example.com",
      sourceUrl: "https://example.com/",
      token: "tok",
      resolveTxt: async (hostname) => {
        expect(hostname).toBe("_hyperlocalise-verify.example.com");
        return [["hyperlocalise-site-verification=tok"]];
      },
    });

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.method).toBe("dns_txt");
    }
  });

  it("verifies HTML file via injectable fetch", async () => {
    const fetchPublic = vi.fn(async (_url, _init, handler) =>
      handler(new Response("tok", { status: 200 })),
    );

    const result = await verifyLinkedDomainChallenge({
      method: "html_file",
      domainKey: "example.com",
      sourceUrl: "https://example.com/",
      token: "tok",
      fetchPublic,
    });

    expect(isOk(result)).toBe(true);
    expect(fetchPublic).toHaveBeenCalled();
  });

  it("verifies meta tag via injectable fetch", async () => {
    const html =
      '<!doctype html><html><head><meta name="hyperlocalise-site-verification" content="tok" /></head></html>';
    const fetchPublic = vi.fn(async (_url, _init, handler) =>
      handler(new Response(html, { status: 200 })),
    );

    const result = await verifyLinkedDomainChallenge({
      method: "meta_tag",
      domainKey: "example.com",
      sourceUrl: "https://example.com/",
      token: "tok",
      fetchPublic,
    });

    expect(isOk(result)).toBe(true);
  });

  it("returns mismatch when DNS token is wrong", async () => {
    const result = await verifyLinkedDomainChallenge({
      method: "dns_txt",
      domainKey: "example.com",
      sourceUrl: "https://example.com/",
      token: "tok",
      resolveTxt: async () => [["wrong"]],
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe("verification_mismatch");
    }
  });
});
