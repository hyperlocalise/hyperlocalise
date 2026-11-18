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
import "dotenv/config";

import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { app } from "@/api/app";
import { enrichAuthContextWithCapabilities } from "@/api/auth/policy";
import {
  isVendorApiRoute,
  isVendorPagePath,
  isVendorRole,
  refuseVendorUnlessAllowed,
  VENDOR_API_ROUTES,
  VendorAccessDeniedError,
  vendorHomePath,
} from "@/api/auth/vendor-access";
import type { ApiAuthContext } from "@/api/auth/workos";

const { resolveApiAuthContextFromSessionMock } = vi.hoisted(() => ({
  resolveApiAuthContextFromSessionMock: vi.fn(),
}));

vi.mock("@/api/auth/workos-session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/auth/workos-session")>();
  return {
    ...actual,
    resolveApiAuthContextFromSession: resolveApiAuthContextFromSessionMock,
  };
});

const organization = {
  workosOrganizationId: "org_vendor_gate",
  // No such workspace exists, so a handler that is reached finds nothing to return.
  localOrganizationId: "00000000-0000-4000-8000-000000000001",
  name: "Vendor gate",
  slug: "vendor-gate",
  membership: {
    workosMembershipId: "om_vendor_gate",
    role: "vendor" as const,
    accessSource: "workos_authoritative" as const,
  },
};

const vendorAuth: ApiAuthContext = enrichAuthContextWithCapabilities({
  user: {
    workosUserId: "user_vendor_gate",
    localUserId: "00000000-0000-4000-8000-000000000002",
    email: "vendor@example.com",
  },
  organizations: [organization],
  organization,
  activeOrganization: organization,
  membership: organization.membership,
  activeTeam: null,
});

/** Stands in for the session function for a signed-in vendor, refusing exactly as it does. */
function signInAsVendor() {
  resolveApiAuthContextFromSessionMock.mockImplementation(
    async (options: { allowVendor?: boolean } = {}) => {
      refuseVendorUnlessAllowed(vendorAuth, options.allowVendor);
      return vendorAuth;
    },
  );
}

afterEach(() => {
  resolveApiAuthContextFromSessionMock.mockReset();
});

describe("the vendor refusal", () => {
  it("refuses a vendor unless the caller allows one", () => {
    expect(() => refuseVendorUnlessAllowed(vendorAuth, undefined)).toThrow(VendorAccessDeniedError);
    expect(() => refuseVendorUnlessAllowed(vendorAuth, false)).toThrow(VendorAccessDeniedError);
    expect(() => refuseVendorUnlessAllowed(vendorAuth, true)).not.toThrow();
  });

  it("never refuses another role", () => {
    for (const role of [
      "admin",
      "localization_manager",
      "developer",
      "reviewer",
      "translator",
      "member",
    ]) {
      expect(isVendorRole(role)).toBe(false);
      expect(() =>
        refuseVendorUnlessAllowed(
          { membership: { role }, activeOrganization: { slug: "acme" } },
          undefined,
        ),
      ).not.toThrow();
    }
  });

  it("carries the workspace so a page can send the vendor to My jobs", () => {
    try {
      refuseVendorUnlessAllowed(vendorAuth, undefined);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(VendorAccessDeniedError);
      expect((error as VendorAccessDeniedError).organizationSlug).toBe("vendor-gate");
    }
    expect(vendorHomePath("vendor-gate")).toBe("/org/vendor-gate/my-jobs");
  });
});

describe("the pages a vendor may open", () => {
  it.each([
    "/org/acme/my-jobs",
    "/org/acme/my-work",
    "/en/org/acme/my-jobs",
    "/org/acme/projects/p1/jobs/job_1",
    "/fr/org/acme/projects/p1/jobs/job_1/strings",
    "/org/acme/projects/p1/jobs/job_1/",
  ])("allows %s", (path) => {
    expect(isVendorPagePath(path)).toBe(true);
  });

  it.each([
    "/org/acme/dashboard",
    "/org/acme/jobs",
    "/org/acme/members",
    "/org/acme/projects",
    "/org/acme/projects/p1",
    "/org/acme/projects/p1/jobs",
    "/org/acme/projects/p1/strings",
    "/org/acme/projects/p1/files",
    "/org/acme/projects/p1/jobs/job_1/strings/extra",
    "/org/acme/projects/p1/jobs/job_1/report",
    "/org/acme/settings/account",
    "/org/acme/settings/api-keys",
    "/org/acme/reports",
    "/org/acme/glossaries",
    "/org/acme/my-jobs/anything",
    "",
  ])("refuses %s", (path) => {
    expect(isVendorPagePath(path)).toBe(false);
  });

  it("refuses a missing path", () => {
    expect(isVendorPagePath(null)).toBe(false);
    expect(isVendorPagePath(undefined)).toBe(false);
  });
});

describe("the API routes a vendor may call", () => {
  it("matches a route by method and pattern only", () => {
    const route = "/api/orgs/:organizationSlug/jobs/:jobId/mark-done";
    expect(isVendorApiRoute("POST", route)).toBe(true);
    expect(isVendorApiRoute("post", route)).toBe(true);
    expect(isVendorApiRoute("GET", route)).toBe(false);
    expect(isVendorApiRoute("POST", undefined)).toBe(false);
    expect(isVendorApiRoute("POST", "/api/orgs/:organizationSlug/jobs/:jobId/cancel")).toBe(false);
    expect(isVendorApiRoute("POST", "/api/orgs/acme/jobs/job_1/mark-done")).toBe(false);
  });

  // Every route the API registers is asked for as a signed-in vendor. Wherever a route reads the
  // session, the vendor is refused unless the route is on the list, so a route added later is
  // closed without anyone thinking about it. Routes that never read a session (tokens, webhooks,
  // public files) are not the session's to guard: tokens refuse a vendor in `api-key-access.ts`.
  it("refuses a vendor on every route that reads the session, except the listed ones", async () => {
    signInAsVendor();
    const routes = new Map<string, { method: string; path: string }>();
    for (const route of app.routes) {
      if (route.method !== "ALL") {
        routes.set(`${route.method} ${route.path}`, { method: route.method, path: route.path });
      }
    }
    expect(routes.size).toBeGreaterThan(300);

    const allowed = new Set<string>();
    const readSession: string[] = [];
    const wronglyOpen: string[] = [];
    for (const [key, route] of routes) {
      resolveApiAuthContextFromSessionMock.mockClear();
      const url = `http://localhost${route.path.replaceAll(/:[A-Za-z]+\??/g, "x").replaceAll("*", "x")}`;
      const response = await app.request(url, {
        method: route.method,
        headers: { cookie: "wos-session=vendor", "content-type": "application/json" },
        ...(route.method === "GET" || route.method === "HEAD" ? {} : { body: "{}" }),
      });
      const calls = resolveApiAuthContextFromSessionMock.mock.calls as Array<
        [{ allowVendor?: boolean } | undefined]
      >;
      if (calls.length === 0) {
        continue;
      }
      readSession.push(key);
      if (calls.some(([options]) => options?.allowVendor)) {
        allowed.add(key);
      } else if (response.status !== 403) {
        wronglyOpen.push(`${key} -> ${response.status}`);
      }
    }

    expect(readSession.length).toBeGreaterThan(300);
    expect(wronglyOpen).toEqual([]);
    expect([...allowed].toSorted()).toEqual([...VENDOR_API_ROUTES].toSorted());
  }, 120_000);

  it("lists exactly the routes the design opens", () => {
    expect([...VENDOR_API_ROUTES].toSorted()).toEqual([
      "GET /api/orgs/:organizationSlug/projects/:projectId/assets/:fileId",
      "GET /api/orgs/:organizationSlug/projects/:projectId/files/translations/download",
      "POST /api/orgs/:organizationSlug/jobs/:jobId/mark-done",
      "POST /api/orgs/:organizationSlug/projects/:projectId/files/detail/cat/concordance",
    ]);
  });
});
