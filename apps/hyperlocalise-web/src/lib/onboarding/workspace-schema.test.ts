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

import { createWorkspaceSchema, WORKSPACE_IDENTITY_BLOCKED_MESSAGE } from "./workspace-schema";

describe("createWorkspaceSchema", () => {
  it("rejects a reserved workspace name", () => {
    const result = createWorkspaceSchema.safeParse({ organizationName: "Test Workspace" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({
          path: ["organizationName"],
          message: WORKSPACE_IDENTITY_BLOCKED_MESSAGE,
        }),
      );
    }
  });

  it("accepts a workspace name with a safe substring", () => {
    expect(createWorkspaceSchema.safeParse({ organizationName: "Contest Labs" }).success).toBe(
      true,
    );
  });
});
