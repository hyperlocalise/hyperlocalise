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

import { updateWorkspaceBodySchema } from "./workspace.schema";

describe("updateWorkspaceBodySchema", () => {
  it.each([
    { name: "Demo Workspace" },
    { slug: "acme-test" },
    { name: "Shit Happens Studio" },
    { slug: "acme-shit-studio" },
  ])("rejects blocked workspace identity values", (payload) => {
    expect(updateWorkspaceBodySchema.safeParse(payload).success).toBe(false);
  });

  it("reports the blocked field", () => {
    const result = updateWorkspaceBodySchema.safeParse({ slug: "sample-workspace" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({
          path: ["slug"],
          message: "Choose a workspace slug without profanity or reserved words",
        }),
      );
    }
  });

  it("allows safe substrings", () => {
    expect(
      updateWorkspaceBodySchema.safeParse({
        name: "Contest Labs",
        slug: "contest-labs",
      }).success,
    ).toBe(true);
  });
});
