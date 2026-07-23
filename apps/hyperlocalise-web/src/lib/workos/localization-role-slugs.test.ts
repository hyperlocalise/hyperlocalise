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
  isKnownWorkosLocalizationRoleSlug,
  WORKOS_LOCALIZATION_ROLE_SLUGS,
} from "./localization-role-slugs";

describe("WORKOS_LOCALIZATION_ROLE_SLUGS", () => {
  it("lists every supported WorkOS role slug", () => {
    expect(WORKOS_LOCALIZATION_ROLE_SLUGS).toEqual([
      "admin",
      "localization_manager",
      "developer",
      "reviewer",
      "translator",
      "member",
    ]);
  });
});

describe("isKnownWorkosLocalizationRoleSlug", () => {
  it("accepts supported slugs", () => {
    for (const slug of WORKOS_LOCALIZATION_ROLE_SLUGS) {
      expect(isKnownWorkosLocalizationRoleSlug(slug)).toBe(true);
    }
  });

  it("rejects unknown slugs", () => {
    expect(isKnownWorkosLocalizationRoleSlug("owner")).toBe(false);
    expect(isKnownWorkosLocalizationRoleSlug(undefined)).toBe(false);
  });
});
