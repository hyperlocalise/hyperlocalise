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

import {
  isBlockedHost,
  isBlockedIpv4Address,
  isBlockedIpv6Address,
  isPublicHttpUrl,
} from "./ssrf-guard";

describe("ssrf-guard", () => {
  it("blocks private IPv4 addresses", () => {
    expect(isBlockedIpv4Address("127.0.0.1")).toBe(true);
    expect(isBlockedIpv4Address("10.0.0.1")).toBe(true);
    expect(isBlockedIpv4Address("192.168.1.1")).toBe(true);
    expect(isBlockedIpv4Address("8.8.8.8")).toBe(false);
  });

  it("blocks link-local and unique-local IPv6 addresses", () => {
    expect(isBlockedIpv6Address("::1")).toBe(true);
    expect(isBlockedIpv6Address("fe80::1")).toBe(true);
    expect(isBlockedIpv6Address("fc00::1")).toBe(true);
    expect(isBlockedIpv6Address("2001:4860:4860::8888")).toBe(false);
  });

  it("rejects localhost and metadata hosts for public HTTP URLs", () => {
    expect(isPublicHttpUrl("http://localhost/test")).toBe(false);
    expect(isPublicHttpUrl("https://169.254.169.254/latest/meta-data")).toBe(false);
    expect(isPublicHttpUrl("https://example.com/resource")).toBe(true);
  });

  it("treats blocked hostnames as unsafe", () => {
    expect(isBlockedHost("metadata.google.internal")).toBe(false);
    expect(isBlockedHost("localhost")).toBe(true);
    expect(isBlockedHost("127.0.0.1")).toBe(true);
  });
});
