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

import { intercomHelpCentersQuerySchema } from "./intercom.schema";

describe("intercomHelpCentersQuerySchema", () => {
  it("defaults the Help Center picker to the US Intercom region", () => {
    expect(intercomHelpCentersQuerySchema.parse({})).toEqual({ restEndpoint: "us" });
  });

  it("accepts allowlisted regional endpoints", () => {
    expect(intercomHelpCentersQuerySchema.parse({ restEndpoint: "eu" })).toEqual({
      restEndpoint: "eu",
    });
    expect(intercomHelpCentersQuerySchema.parse({ restEndpoint: "au" })).toEqual({
      restEndpoint: "au",
    });
  });

  it("rejects URLs and unknown region keys", () => {
    expect(intercomHelpCentersQuerySchema.safeParse({ restEndpoint: "US" }).success).toBe(false);
    expect(
      intercomHelpCentersQuerySchema.safeParse({
        restEndpoint: "https://api.intercom.io",
      }).success,
    ).toBe(false);
    expect(intercomHelpCentersQuerySchema.safeParse({ restEndpoint: "jp" }).success).toBe(false);
  });
});
