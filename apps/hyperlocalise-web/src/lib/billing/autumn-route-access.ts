import { err, ok, type Result } from "@/lib/primitives/result/results";

/** Autumn handler route names that mutate billing state (admin-only). */
export const AUTUMN_BILLING_WRITE_ROUTE_NAMES = new Set([
  "attach",
  "updateSubscription",
  "multiAttach",
  "setupPayment",
  "openCustomerPortal",
]);

export type AutumnRouteNameError =
  | {
      code: "autumn_route_outside_prefix";
      pathname: string;
      pathPrefix: string;
    }
  | {
      code: "autumn_route_name_missing";
      pathname: string;
      pathPrefix: string;
    };

export function getAutumnRouteNameFromPath(
  pathname: string,
  pathPrefix = "/api/autumn",
): Result<string, AutumnRouteNameError> {
  if (!pathname.startsWith(pathPrefix)) {
    return err({ code: "autumn_route_outside_prefix", pathname, pathPrefix });
  }

  const suffix = pathname.slice(pathPrefix.length).replace(/^\/+/, "");
  if (!suffix) {
    return err({ code: "autumn_route_name_missing", pathname, pathPrefix });
  }

  return ok(suffix.split("/")[0] ?? suffix);
}
