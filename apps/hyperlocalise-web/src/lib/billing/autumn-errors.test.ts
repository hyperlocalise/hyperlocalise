/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { describe, expect, it } from "vite-plus/test";

import { AutumnClientError } from "autumn-js/react";

import { formatAutumnBillingError } from "@/lib/billing/autumn-errors";

describe("formatAutumnBillingError", () => {
  it("maps known billing API errors to stable messages", () => {
    expect(
      formatAutumnBillingError(
        new AutumnClientError({
          message: "raw provider message",
          code: "billing_write_forbidden",
          statusCode: 403,
        }),
      ),
    ).toBe("Only workspace admins can change plans or open the billing portal.");

    expect(
      formatAutumnBillingError({
        error: "billing_customer_unavailable",
        message: "should not leak",
      }),
    ).toBe("Billing is not available for this workspace.");

    expect(
      formatAutumnBillingError({
        code: "billing_customer_unavailable",
      }),
    ).toBe("Billing is not available for this workspace.");
  });
});
