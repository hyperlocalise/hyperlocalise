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

import { matchSearchConsoleSite } from "./match-site";

describe("matchSearchConsoleSite", () => {
  it("prefers a domain property over a URL-prefix property", () => {
    const match = matchSearchConsoleSite(
      [
        { siteUrl: "https://hyperlocalise.com/", permissionLevel: "siteFullUser" },
        { siteUrl: "sc-domain:hyperlocalise.com", permissionLevel: "siteOwner" },
      ],
      "www.hyperlocalise.com",
    );
    expect(match?.siteUrl).toBe("sc-domain:hyperlocalise.com");
  });

  it("skips unverified properties", () => {
    expect(
      matchSearchConsoleSite(
        [{ siteUrl: "sc-domain:acme.fr", permissionLevel: "siteUnverifiedUser" }],
        "acme.fr",
      ),
    ).toBeNull();
  });

  it("matches a URL-prefix property when no domain property exists", () => {
    const match = matchSearchConsoleSite(
      [{ siteUrl: "https://docs.acme.com/", permissionLevel: "siteOwner" }],
      "docs.acme.com",
    );
    expect(match?.siteUrl).toBe("https://docs.acme.com/");
  });

  it("does not match a sibling or longer hostname", () => {
    expect(
      matchSearchConsoleSite(
        [
          { siteUrl: "https://example.com.au/", permissionLevel: "siteOwner" },
          { siteUrl: "sc-domain:notexample.com", permissionLevel: "siteOwner" },
          { siteUrl: "sc-domain:myexample.com", permissionLevel: "siteOwner" },
        ],
        "example.com",
      ),
    ).toBeNull();
  });

  it("matches a parent domain property for a subdomain", () => {
    const match = matchSearchConsoleSite(
      [{ siteUrl: "sc-domain:acme.com", permissionLevel: "siteOwner" }],
      "docs.acme.com",
    );
    expect(match?.siteUrl).toBe("sc-domain:acme.com");
  });

  it("does not treat a subdomain URL-prefix as the apex domain", () => {
    expect(
      matchSearchConsoleSite(
        [{ siteUrl: "https://docs.acme.com/", permissionLevel: "siteOwner" }],
        "acme.com",
      ),
    ).toBeNull();
  });
});
