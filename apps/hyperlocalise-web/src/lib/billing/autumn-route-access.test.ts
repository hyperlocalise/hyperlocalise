import { describe, expect, it } from "vite-plus/test";

import {
  AUTUMN_BILLING_WRITE_ROUTE_NAMES,
  getAutumnRouteNameFromPath,
} from "@/lib/billing/autumn-route-access";

describe("autumn route access", () => {
  it("parses Autumn route names from API paths", () => {
    expect(getAutumnRouteNameFromPath("/api/autumn/getOrCreateCustomer")).toBe(
      "getOrCreateCustomer",
    );
    expect(getAutumnRouteNameFromPath("/api/autumn/openCustomerPortal/extra")).toBe(
      "openCustomerPortal",
    );
    expect(getAutumnRouteNameFromPath("/api/other")).toBeNull();
  });

  it("tracks billing write routes", () => {
    expect([...AUTUMN_BILLING_WRITE_ROUTE_NAMES].sort()).toEqual(
      ["attach", "multiAttach", "openCustomerPortal", "setupPayment", "updateSubscription"].sort(),
    );
  });
});
