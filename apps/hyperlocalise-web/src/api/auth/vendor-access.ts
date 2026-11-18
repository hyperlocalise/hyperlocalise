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
/**
 * A vendor is an outside person with no rights in the workspace. Every signed-in request and
 * page goes through `resolveApiAuthContextFromSession`, which refuses a vendor unless the
 * caller passes `allowVendor`. Only the routes listed here and the pages that opt in do, and
 * each of them then limits a vendor to their own open tasks (`vendor-task.ts`).
 *
 * The Go service keeps the same rule in `apps/go-svc/vendor-access.go`.
 */
export function isVendorRole(role: string | null | undefined) {
  return role === "vendor";
}

/** Thrown where a vendor reaches a route or page that was not opened to vendors. */
export class VendorAccessDeniedError extends Error {
  constructor(readonly organizationSlug: string | null) {
    super("vendor_access_denied");
  }
}

/**
 * The refusal itself. `resolveApiAuthContextFromSession` calls it for every signed-in request
 * and page; tests that stand in for that function call it too, so they refuse as it does.
 */
export function refuseVendorUnlessAllowed(
  auth: { membership: { role: string }; activeOrganization: { slug?: string | null } },
  allowVendor: boolean | undefined,
) {
  if (isVendorRole(auth.membership.role) && !allowVendor) {
    throw new VendorAccessDeniedError(auth.activeOrganization.slug ?? null);
  }
}

/** Where a vendor is sent from a page that stays closed. */
export function vendorHomePath(organizationSlug: string) {
  return `/org/${organizationSlug}/my-jobs`;
}

/**
 * The API routes a vendor may call, as `METHOD route-pattern`. A route that is not listed
 * refuses a vendor before its handler runs, so a route added later is closed without anyone
 * thinking about it.
 */
export const VENDOR_API_ROUTES: ReadonlySet<string> = new Set([
  // Mark done, on an open task the vendor owns.
  "POST /api/orgs/:organizationSlug/jobs/:jobId/mark-done",
  // The editor's memory and glossary lookup, for the languages of an open task they own.
  "POST /api/orgs/:organizationSlug/projects/:projectId/files/detail/cat/concordance",
  // The file of an open task they own: as uploaded, and its translation in a task language.
  "GET /api/orgs/:organizationSlug/projects/:projectId/assets/:fileId",
  "GET /api/orgs/:organizationSlug/projects/:projectId/files/translations/download",
]);

export function isVendorApiRoute(method: string, routePattern: string | undefined) {
  return (
    routePattern !== undefined && VENDOR_API_ROUTES.has(`${method.toUpperCase()} ${routePattern}`)
  );
}

/**
 * The pages a vendor may open: My jobs, a task's page and the editor opened from a task. Each
 * of them also passes `allowVendor` when it loads on the server and limits a vendor to their
 * own tasks. The path may carry a language prefix.
 */
const VENDOR_PAGE_PATHS = [
  /\/org\/[^/]+\/(?:my-jobs|my-work)\/?$/,
  /\/org\/[^/]+\/projects\/[^/]+\/jobs\/[^/]+(?:\/strings)?\/?$/,
];

export function isVendorPagePath(pathname: string | null | undefined) {
  return Boolean(pathname) && VENDOR_PAGE_PATHS.some((pattern) => pattern.test(pathname!));
}
