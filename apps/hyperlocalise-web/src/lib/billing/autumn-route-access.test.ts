import { describe, expect, it } from "vite-plus/test";

import {
  AUTUMN_BILLING_WRITE_ROUTE_NAMES,
  getAutumnRouteNameFromPath,
} from "@/lib/billing/autumn-route-access";
import { isErr } from "@/lib/primitives/result/results";

describe("autumn route access", () => {
  it("parses Autumn route names from API paths", () => {
    const readRoute = getAutumnRouteNameFromPath("/api/autumn/getOrCreateCustomer");
    const writeRoute = getAutumnRouteNameFromPath("/api/autumn/openCustomerPortal/extra");
    const outsideRoute = getAutumnRouteNameFromPath("/api/other");

    if (isErr(readRoute) || isErr(writeRoute)) {
      throw new Error("Expected Autumn route names to parse");
    }

    expect(readRoute.value).toBe("getOrCreateCustomer");
    expect(writeRoute.value).toBe("openCustomerPortal");
    expect(outsideRoute).toMatchObject({
      ok: false,
      error: { code: "autumn_route_outside_prefix" },
    });
  });

  it("tracks billing write routes", () => {
    expect([...AUTUMN_BILLING_WRITE_ROUTE_NAMES].sort()).toEqual(
      ["attach", "multiAttach", "openCustomerPortal", "setupPayment", "updateSubscription"].sort(),
    );
  });
});
