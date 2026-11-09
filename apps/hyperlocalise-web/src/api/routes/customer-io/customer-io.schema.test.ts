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
  customerIoActionsQuerySchema,
  upsertCustomerIoConnectionBodySchema,
} from "./customer-io.schema";

describe("upsertCustomerIoConnectionBodySchema", () => {
  it("accepts an allowlisted region", () => {
    expect(upsertCustomerIoConnectionBodySchema.parse({ region: "us" })).toEqual({
      region: "us",
    });
  });

  it("accepts an optional API key with the region", () => {
    expect(
      upsertCustomerIoConnectionBodySchema.parse({
        region: "eu",
        apiKey: "cio-app-key",
      }),
    ).toEqual({
      region: "eu",
      apiKey: "cio-app-key",
    });
  });

  it("rejects unknown regions", () => {
    expect(upsertCustomerIoConnectionBodySchema.safeParse({ region: "ap" }).success).toBe(false);
    expect(
      upsertCustomerIoConnectionBodySchema.safeParse({ region: "https://api.customer.io/v1" })
        .success,
    ).toBe(false);
  });
});

describe("customerIoActionsQuerySchema", () => {
  it("accepts every resource kind with an id", () => {
    for (const kind of ["broadcast", "campaign", "newsletter", "transactional"] as const) {
      expect(customerIoActionsQuerySchema.parse({ kind, id: "12" })).toEqual({ kind, id: "12" });
    }
  });

  it("rejects unknown kinds and blank ids", () => {
    expect(customerIoActionsQuerySchema.safeParse({ kind: "template", id: "12" }).success).toBe(
      false,
    );
    expect(customerIoActionsQuerySchema.safeParse({ kind: "broadcast", id: "  " }).success).toBe(
      false,
    );
    expect(customerIoActionsQuerySchema.safeParse({ kind: "broadcast" }).success).toBe(false);
  });
});
