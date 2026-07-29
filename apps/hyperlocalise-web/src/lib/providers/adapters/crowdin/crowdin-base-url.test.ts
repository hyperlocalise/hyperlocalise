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
  CROWDIN_DEFAULT_API_BASE_URL,
  crowdinAuthenticatedUserUrl,
  isCrowdinEnterpriseApiBaseUrl,
  normalizeCrowdinApiBaseUrl,
  resolveCrowdinApiBaseUrl,
} from "./crowdin-api";

describe("crowdin-base-url", () => {
  it("resolves the default SaaS API base URL", () => {
    expect(resolveCrowdinApiBaseUrl()).toBe(CROWDIN_DEFAULT_API_BASE_URL);
    expect(normalizeCrowdinApiBaseUrl()).toBe(CROWDIN_DEFAULT_API_BASE_URL);
  });

  it("preserves enterprise API base URLs that already include /api/v2", () => {
    expect(resolveCrowdinApiBaseUrl("https://enterprise.crowdin.test/api/v2")).toBe(
      "https://enterprise.crowdin.test/api/v2",
    );
    expect(isCrowdinEnterpriseApiBaseUrl("https://enterprise.crowdin.test/api/v2")).toBe(true);
    expect(isCrowdinEnterpriseApiBaseUrl()).toBe(false);
  });

  it("builds the authenticated user URL without duplicating /api/v2", () => {
    expect(crowdinAuthenticatedUserUrl()).toBe("https://api.crowdin.com/api/v2/user");
    expect(crowdinAuthenticatedUserUrl("https://enterprise.crowdin.test/api/v2")).toBe(
      "https://enterprise.crowdin.test/api/v2/user",
    );
  });
});
