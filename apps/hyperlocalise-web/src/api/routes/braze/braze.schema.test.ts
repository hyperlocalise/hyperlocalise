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

import { upsertBrazeConnectionBodySchema } from "./braze.schema";

describe("upsertBrazeConnectionBodySchema", () => {
  it("accepts an allowlisted cluster key", () => {
    expect(upsertBrazeConnectionBodySchema.parse({ restEndpoint: "iad-03" })).toEqual({
      restEndpoint: "iad-03",
    });
  });

  it("accepts an optional API key with the cluster", () => {
    expect(
      upsertBrazeConnectionBodySchema.parse({
        restEndpoint: "iad-03",
        apiKey: "braze-rest-key",
      }),
    ).toEqual({
      restEndpoint: "iad-03",
      apiKey: "braze-rest-key",
    });
  });

  it("rejects URLs and unknown cluster keys", () => {
    expect(upsertBrazeConnectionBodySchema.safeParse({ restEndpoint: "iad-99" }).success).toBe(
      false,
    );
    expect(
      upsertBrazeConnectionBodySchema.safeParse({
        restEndpoint: "https://rest.iad-03.braze.com",
      }).success,
    ).toBe(false);
  });
});
