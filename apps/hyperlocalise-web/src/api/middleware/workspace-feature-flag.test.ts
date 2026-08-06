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
import type { Flag } from "flags/next";
import { describe, expect, it, vi } from "vite-plus/test";

import type { AuthVariables } from "@/api/auth/workos";
import type { WorkosFlagEntities } from "@/lib/flags/workos-flag-entities";

import { isWorkspaceFeatureFlagEnabled } from "./workspace-feature-flag";

const auth = {
  organization: { workosOrganizationId: "org_test" },
  user: { workosUserId: "user_test" },
} as AuthVariables["auth"];

function flagWithRun(
  run: Flag<boolean, WorkosFlagEntities>["run"],
): Flag<boolean, WorkosFlagEntities> {
  return { run } as Flag<boolean, WorkosFlagEntities>;
}

describe("isWorkspaceFeatureFlagEnabled", () => {
  it("returns true only for an explicit true flag result", async () => {
    await expect(
      isWorkspaceFeatureFlagEnabled(flagWithRun(vi.fn(async () => true)), auth),
    ).resolves.toBe(true);
    await expect(
      isWorkspaceFeatureFlagEnabled(flagWithRun(vi.fn(async () => false)), auth),
    ).resolves.toBe(false);
  });

  it("fails closed when flag evaluation throws", async () => {
    await expect(
      isWorkspaceFeatureFlagEnabled(
        flagWithRun(
          vi.fn(async () => {
            throw new Error("flags unavailable");
          }),
        ),
        auth,
      ),
    ).resolves.toBe(false);
  });

  it("identifies the workspace org and user for evaluation", async () => {
    const run: Flag<boolean, WorkosFlagEntities>["run"] = vi.fn(async (options) => {
      const identify = options.identify;
      const entities =
        typeof identify === "function"
          ? await identify()
          : (identify as WorkosFlagEntities | undefined);
      expect(entities).toEqual({
        organization: { id: "org_test" },
        user: { id: "user_test" },
      });
      return true;
    });

    await expect(isWorkspaceFeatureFlagEnabled(flagWithRun(run), auth)).resolves.toBe(true);
    expect(run).toHaveBeenCalledOnce();
  });
});
