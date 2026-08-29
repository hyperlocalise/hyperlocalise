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

import { describe, expect, it } from "vite-plus/test";

import type { OrganizationMembershipRole } from "@/lib/database/types";

import {
  isGlossaryContributeAllowed,
  isGlossaryContributorRole,
  isGlossaryManageAllowed,
  resolveCreateGlossaryControlLevel,
} from "./glossary.shared";

describe("isGlossaryManageAllowed", () => {
  it.each([
    ["admin", true],
    ["localization_manager", true],
    ["developer", false],
    ["reviewer", false],
    ["translator", false],
    ["member", false],
  ] as const satisfies ReadonlyArray<readonly [OrganizationMembershipRole, boolean]>)(
    "%s manage glossaries: %s",
    (role, allowed) => {
      expect(isGlossaryManageAllowed(role)).toBe(allowed);
    },
  );
});

describe("isGlossaryContributorRole", () => {
  it("includes translators and glossary managers only", () => {
    expect(isGlossaryContributorRole("translator")).toBe(true);
    expect(isGlossaryContributorRole("admin")).toBe(true);
    expect(isGlossaryContributorRole("developer")).toBe(false);
    expect(isGlossaryContributorRole("member")).toBe(false);
  });
});

describe("resolveCreateGlossaryControlLevel", () => {
  it("lets managers default to org and honor an explicit team request", () => {
    expect(resolveCreateGlossaryControlLevel("admin", undefined)).toBe("org");
    expect(resolveCreateGlossaryControlLevel("localization_manager", "team")).toBe("team");
  });

  it("forces translators onto team glossaries and rejects org requests", () => {
    expect(resolveCreateGlossaryControlLevel("translator", undefined)).toBe("team");
    expect(resolveCreateGlossaryControlLevel("translator", "team")).toBe("team");
    expect(resolveCreateGlossaryControlLevel("translator", "org")).toBeNull();
  });

  it("rejects create for roles that cannot contribute glossaries", () => {
    expect(resolveCreateGlossaryControlLevel("developer", "team")).toBeNull();
    expect(resolveCreateGlossaryControlLevel("member", undefined)).toBeNull();
    expect(resolveCreateGlossaryControlLevel("reviewer", "org")).toBeNull();
  });
});

describe("isGlossaryContributeAllowed", () => {
  it("allows managers on any glossary", () => {
    expect(isGlossaryContributeAllowed("admin", { controlLevel: "org", source: "native" })).toBe(
      true,
    );
    expect(
      isGlossaryContributeAllowed("localization_manager", {
        controlLevel: "team",
        source: "external_tms",
      }),
    ).toBe(true);
  });

  it("limits translators to native team glossaries", () => {
    expect(
      isGlossaryContributeAllowed("translator", { controlLevel: "team", source: "native" }),
    ).toBe(true);
    expect(
      isGlossaryContributeAllowed("translator", { controlLevel: "org", source: "native" }),
    ).toBe(false);
    expect(
      isGlossaryContributeAllowed("translator", {
        controlLevel: "team",
        source: "external_tms",
      }),
    ).toBe(false);
  });

  it("denies non-contributor roles", () => {
    expect(
      isGlossaryContributeAllowed("developer", { controlLevel: "team", source: "native" }),
    ).toBe(false);
    expect(isGlossaryContributeAllowed("member", { controlLevel: "team", source: "native" })).toBe(
      false,
    );
  });
});
