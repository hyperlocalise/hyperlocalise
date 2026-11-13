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

import { getIntlShape } from "@/lib/app-i18n/intl";

import {
  getAuthenticatedLayoutMetadata,
  getAuthenticatedPageMetadata,
} from "./authenticated-page-metadata";
import {
  AUTHENTICATED_PAGE_KEYS,
  AUTHENTICATED_TITLE_TEMPLATE,
  getAuthenticatedRouteMetadata,
} from "./authenticated-route-metadata";
import { PRIVATE_ROBOTS } from "./robots-metadata";

describe("authenticated page metadata", () => {
  const intl = getIntlShape("en");

  it("returns a title and description for every authenticated page key", () => {
    for (const page of AUTHENTICATED_PAGE_KEYS) {
      const copy = getAuthenticatedRouteMetadata(intl, page);

      expect(copy.title.trim().length).toBeGreaterThan(0);
      expect(copy.description.trim().length).toBeGreaterThan(0);
    }
  });

  it("keeps workspace pages out of search indexes", () => {
    expect(getAuthenticatedPageMetadata("en", "projects").robots).toEqual(PRIVATE_ROBOTS);
  });

  it("uses a title template on the authenticated layout", () => {
    const metadata = getAuthenticatedLayoutMetadata("en");

    expect(metadata.title).toEqual({
      default: "Hyperlocalise",
      template: AUTHENTICATED_TITLE_TEMPLATE,
    });
    expect(metadata.description).toBe("Workspace for localisation projects, jobs, and reviews.");
  });

  it("appends the brand suffix for routes outside the authenticated layout", () => {
    const metadata = getAuthenticatedPageMetadata("en", "onboarding", {
      includeBrandSuffix: true,
    });

    expect(metadata.title).toBe("Onboarding | Hyperlocalise");
  });

  it("returns page titles without the brand suffix for layout children", () => {
    expect(getAuthenticatedPageMetadata("en", "projects").title).toBe("Projects");
  });
});
