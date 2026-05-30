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
    ).toBe("Only workspace owners and admins can change plans or open the billing portal.");

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
