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

import { fetchMailchimpOAuthApiBaseUrl } from "./oauth-metadata";
import { MAILCHIMP_CREDENTIALS_INVALID } from "./ping";

describe("fetchMailchimpOAuthApiBaseUrl", () => {
  it("returns api_endpoint without a trailing slash", async () => {
    const fetchImpl = async () =>
      new Response(JSON.stringify({ api_endpoint: "https://us1.api.mailchimp.com/3.0/" }), {
        status: 200,
      });

    const result = await fetchMailchimpOAuthApiBaseUrl({
      accessToken: "token",
      fetchImpl,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe("https://us1.api.mailchimp.com/3.0");
    }
  });

  it("appends /3.0 when metadata omits the version path", async () => {
    const fetchImpl = async () =>
      new Response(JSON.stringify({ api_endpoint: "https://us21.api.mailchimp.com" }), {
        status: 200,
      });

    const result = await fetchMailchimpOAuthApiBaseUrl({
      accessToken: "token",
      fetchImpl,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe("https://us21.api.mailchimp.com/3.0");
    }
  });

  it("maps 401 to invalid credentials", async () => {
    const fetchImpl = async () => new Response("", { status: 401 });

    const result = await fetchMailchimpOAuthApiBaseUrl({
      accessToken: "token",
      fetchImpl,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toEqual(MAILCHIMP_CREDENTIALS_INVALID);
    }
  });
});
