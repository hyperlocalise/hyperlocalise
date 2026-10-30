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

import { pingHubspotCredentials } from "./ping";

describe("pingHubspotCredentials", () => {
  it("rejects an empty token", async () => {
    const result = await pingHubspotCredentials({ accessToken: "  " });
    expect(isErr(result) && result.error.code).toBe("hubspot_credentials_invalid");
  });

  it("accepts a token that has content and forms", async () => {
    const result = await pingHubspotCredentials({
      accessToken: "pat-1",
      lookupScopes: async () => ["content", "forms"],
    });
    expect(isOk(result)).toBe(true);
  });

  it("rejects a token missing a required scope", async () => {
    const result = await pingHubspotCredentials({
      accessToken: "pat-1",
      lookupScopes: async () => ["content"],
    });
    expect(isErr(result) && result.error.message).toContain("content or forms");
  });

  it("maps 401 to invalid credentials", async () => {
    const result = await pingHubspotCredentials({
      accessToken: "pat-1",
      lookupScopes: async () => {
        throw { code: 401 };
      },
    });
    expect(isErr(result) && result.error.code).toBe("hubspot_credentials_invalid");
  });
});
