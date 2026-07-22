/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { describe, expect, it } from "vite-plus/test";

import { extractCrowdinAppJwtClaims } from "./jwt";

describe("extractCrowdinAppJwtClaims", () => {
  it("reads user, organization, and project ids from context", () => {
    expect(
      extractCrowdinAppJwtClaims({
        sub: "9",
        context: {
          organization_id: 42,
          user_id: 7,
          project_id: 902807,
        },
      }),
    ).toEqual({
      crowdinUserId: 7,
      crowdinOrganizationId: 42,
      crowdinProjectId: 902807,
      domain: null,
    });
  });

  it("falls back to sub and nested project id", () => {
    expect(
      extractCrowdinAppJwtClaims({
        sub: "11",
        domain: "acme",
        context: {
          organization_id: "55",
          project: { id: "100" },
        },
      }),
    ).toEqual({
      crowdinUserId: 11,
      crowdinOrganizationId: 55,
      crowdinProjectId: 100,
      domain: "acme",
    });
  });

  it("rejects missing project id", () => {
    expect(
      extractCrowdinAppJwtClaims({
        context: {
          organization_id: 1,
          user_id: 2,
        },
      }),
    ).toEqual({ error: "crowdin_jwt_missing_project_id" });
  });
});
