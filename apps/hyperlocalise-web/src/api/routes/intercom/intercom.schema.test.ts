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

import { intercomHelpCenterIdParamSchema, intercomHelpCentersQuerySchema } from "./intercom.schema";

describe("intercomHelpCentersQuerySchema", () => {
  it("does not require a region because the connected account is probed", () => {
    expect(intercomHelpCentersQuerySchema.parse({})).toEqual({});
  });

  it("accepts an optional allowlisted regional endpoint from older clients", () => {
    expect(intercomHelpCentersQuerySchema.parse({ restEndpoint: "eu" })).toEqual({
      restEndpoint: "eu",
    });
    expect(intercomHelpCentersQuerySchema.parse({ restEndpoint: "au" })).toEqual({
      restEndpoint: "au",
    });
    expect(intercomHelpCentersQuerySchema.parse({ restEndpoint: "us" })).toEqual({
      restEndpoint: "us",
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

describe("intercomHelpCenterIdParamSchema", () => {
  it("requires a Help Center id for collection listing", () => {
    expect(intercomHelpCenterIdParamSchema.parse({ helpCenterId: "123" })).toEqual({
      helpCenterId: "123",
    });
    expect(intercomHelpCenterIdParamSchema.safeParse({ helpCenterId: "" }).success).toBe(false);
    expect(intercomHelpCenterIdParamSchema.safeParse({}).success).toBe(false);
  });
});
