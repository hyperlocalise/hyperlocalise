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

import { isErr } from "@/lib/primitives/result/results";

import { discoverContentfulSpace } from "./discover-contentful-space";

describe("discoverContentfulSpace", () => {
  it("returns a missing-credentials Result when no token or connection is provided", async () => {
    const result = await discoverContentfulSpace({
      organizationId: crypto.randomUUID(),
      spaceId: "space-id",
      environmentId: "master",
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe("contentful_discovery_missing_credentials");
      expect(result.error.message).toContain("Content Management API token");
    }
  });
});
