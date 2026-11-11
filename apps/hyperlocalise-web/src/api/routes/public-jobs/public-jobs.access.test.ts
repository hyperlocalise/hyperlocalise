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

import type { ApiAuthContext } from "@/api/auth/workos";

import { canAccessStoredFileWithProjectScope } from "./public-jobs.access";

function teamAccess(localUserId: string): ApiAuthContext {
  return { user: { localUserId } } as ApiAuthContext;
}

describe("canAccessStoredFileWithProjectScope", () => {
  const orgWide = {
    organizationId: "org_1",
    accessibleProjectIds: null as string[] | null,
  };
  const teamScoped = {
    organizationId: "org_1",
    accessibleProjectIds: ["project_alpha"],
  };

  it("rejects files from another organization", () => {
    expect(
      canAccessStoredFileWithProjectScope(teamAccess("user_1"), orgWide, {
        organizationId: "org_other",
        projectId: "project_alpha",
      }),
    ).toBe(false);
  });

  it("allows a project file when the key can see that project", () => {
    expect(
      canAccessStoredFileWithProjectScope(teamAccess("user_1"), teamScoped, {
        organizationId: "org_1",
        projectId: "project_alpha",
      }),
    ).toBe(true);
  });

  it("hides a project file that the team-scoped key cannot access", () => {
    expect(
      canAccessStoredFileWithProjectScope(teamAccess("user_1"), teamScoped, {
        organizationId: "org_1",
        projectId: "project_beta",
      }),
    ).toBe(false);
  });

  it("allows org-wide files for organization-wide keys", () => {
    expect(
      canAccessStoredFileWithProjectScope(teamAccess("user_1"), orgWide, {
        organizationId: "org_1",
        projectId: null,
        createdByUserId: "user_other",
      }),
    ).toBe(true);
  });

  it("allows an unattributed org-wide file for a team-scoped key", () => {
    expect(
      canAccessStoredFileWithProjectScope(teamAccess("user_1"), teamScoped, {
        organizationId: "org_1",
        projectId: null,
        createdByUserId: null,
      }),
    ).toBe(true);
  });

  it("allows an org-wide file only when the team-scoped caller uploaded it", () => {
    expect(
      canAccessStoredFileWithProjectScope(teamAccess("user_1"), teamScoped, {
        organizationId: "org_1",
        projectId: null,
        createdByUserId: "user_1",
      }),
    ).toBe(true);
    expect(
      canAccessStoredFileWithProjectScope(teamAccess("user_1"), teamScoped, {
        organizationId: "org_1",
        projectId: null,
        createdByUserId: "user_other",
      }),
    ).toBe(false);
  });
});
