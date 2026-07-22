/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { describe, expect, it } from "vite-plus/test";

import {
  providerSupportsTaskCreate,
  providerSupportsTaskDelete,
} from "@/lib/providers/adapters/tms-provider-registry";

describe("tms provider task create/delete support", () => {
  it("supports Crowdin task create and delete", () => {
    expect(providerSupportsTaskCreate("crowdin")).toBe(true);
    expect(providerSupportsTaskDelete("crowdin")).toBe(true);
  });

  it("does not support task create/delete for providers without overrides", () => {
    expect(providerSupportsTaskCreate("smartling")).toBe(false);
    expect(providerSupportsTaskDelete("smartling")).toBe(false);
  });
});
