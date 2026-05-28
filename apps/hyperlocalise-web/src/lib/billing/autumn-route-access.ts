/** Autumn handler route names that mutate billing state (admin-only). */
export const AUTUMN_BILLING_WRITE_ROUTE_NAMES = new Set([
  "attach",
  "updateSubscription",
  "multiAttach",
  "setupPayment",
  "openCustomerPortal",
]);

export function getAutumnRouteNameFromPath(
  pathname: string,
  pathPrefix = "/api/autumn",
): string | null {
  if (!pathname.startsWith(pathPrefix)) {
    return null;
  }

  const suffix = pathname.slice(pathPrefix.length).replace(/^\/+/, "");
  if (!suffix) {
    return null;
  }

  return suffix.split("/")[0] ?? null;
}
