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
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const assertResolvablePublicHttpUrlMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/security/public-http-fetch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/security/public-http-fetch")>();
  return {
    ...actual,
    assertResolvablePublicHttpUrl: assertResolvablePublicHttpUrlMock,
  };
});

import { err, ok } from "@/lib/primitives/result/results";

import {
  filterAllowedBrowserUrls,
  isAllowedBrowserUrl,
  isBlockedBrowserNavigationUrl,
} from "./audit-browser-url-guard";

describe("isBlockedBrowserNavigationUrl", () => {
  it("blocks private hosts, non-http schemes, and unparseable values", () => {
    expect(isBlockedBrowserNavigationUrl("http://127.0.0.1/secret")).toBe(true);
    expect(isBlockedBrowserNavigationUrl("http://localhost/admin")).toBe(true);
    expect(isBlockedBrowserNavigationUrl("http://10.0.0.4/internal")).toBe(true);
    expect(isBlockedBrowserNavigationUrl("http://169.254.169.254/latest/meta-data")).toBe(true);
    expect(isBlockedBrowserNavigationUrl("file:///etc/passwd")).toBe(true);
    expect(isBlockedBrowserNavigationUrl("javascript:alert(1)")).toBe(true);
    expect(isBlockedBrowserNavigationUrl("ftp://example.com/file")).toBe(true);
    expect(isBlockedBrowserNavigationUrl("not a url")).toBe(true);
    expect(isBlockedBrowserNavigationUrl("https://example.com/fr")).toBe(false);
    expect(isBlockedBrowserNavigationUrl("http://example.com/en")).toBe(false);
  });
});

describe("isAllowedBrowserUrl", () => {
  beforeEach(() => {
    assertResolvablePublicHttpUrlMock.mockReset();
    assertResolvablePublicHttpUrlMock.mockImplementation(async (url: string) => ok(new URL(url)));
  });

  it("rejects blocked and non-http URLs without resolving them", async () => {
    await expect(isAllowedBrowserUrl("http://127.0.0.1/secret")).resolves.toBe(false);
    await expect(isAllowedBrowserUrl("file:///etc/passwd")).resolves.toBe(false);
    expect(assertResolvablePublicHttpUrlMock).not.toHaveBeenCalled();
  });

  it("allows a public http URL that resolves to a public address", async () => {
    await expect(isAllowedBrowserUrl("https://example.com/fr")).resolves.toBe(true);
    expect(assertResolvablePublicHttpUrlMock).toHaveBeenCalledWith("https://example.com/fr");
  });

  it("rejects a public-looking URL whose DNS is not public", async () => {
    assertResolvablePublicHttpUrlMock.mockResolvedValueOnce(
      err({ code: "host_resolves_to_restricted_address" }),
    );
    await expect(isAllowedBrowserUrl("https://rebind.example.com/")).resolves.toBe(false);
  });
});

describe("filterAllowedBrowserUrls", () => {
  beforeEach(() => {
    assertResolvablePublicHttpUrlMock.mockReset();
    assertResolvablePublicHttpUrlMock.mockImplementation(async (url: string) => ok(new URL(url)));
  });

  it("keeps only resolvable public http URLs, in order", async () => {
    assertResolvablePublicHttpUrlMock.mockImplementation(async (url: string) => {
      if (url.includes("rebind")) {
        return err({ code: "host_resolves_to_restricted_address" });
      }
      return ok(new URL(url));
    });

    await expect(
      filterAllowedBrowserUrls([
        "https://example.com/en",
        "http://127.0.0.1/secret",
        "https://rebind.example.com/fr",
        "https://example.com/de",
        "javascript:alert(1)",
      ]),
    ).resolves.toEqual(["https://example.com/en", "https://example.com/de"]);
  });
});
