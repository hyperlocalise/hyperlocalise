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

import { getOrgNavigationTransitionTypes, getOrgRouteDepth } from "./org-nav-transition";

describe("org-nav-transition", () => {
  it("measures depth after the organization slug", () => {
    expect(getOrgRouteDepth("/fr-FR/org/acme/dashboard")).toBe(1);
    expect(getOrgRouteDepth("/org/acme/projects")).toBe(1);
    expect(getOrgRouteDepth("/en/org/acme/projects/proj_1")).toBe(2);
    expect(getOrgRouteDepth("/en/org/acme/projects/proj_1/jobs/job_1")).toBe(4);
  });

  it("returns forward for drill-down navigation", () => {
    expect(
      getOrgNavigationTransitionTypes("/fr-FR/org/acme/projects", "/org/acme/projects/proj_1"),
    ).toEqual(["nav-forward"]);
  });

  it("returns back for upward navigation", () => {
    expect(
      getOrgNavigationTransitionTypes("/fr-FR/org/acme/projects/proj_1", "/org/acme/projects"),
    ).toEqual(["nav-back"]);
  });

  it("returns undefined for lateral navigation at the same depth", () => {
    expect(
      getOrgNavigationTransitionTypes("/fr-FR/org/acme/dashboard", "/org/acme/projects"),
    ).toBeUndefined();
    expect(
      getOrgNavigationTransitionTypes(
        "/fr-FR/org/acme/projects/proj_1/files",
        "/org/acme/projects/proj_1/jobs",
      ),
    ).toBeUndefined();
  });
});
