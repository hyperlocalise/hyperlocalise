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

import {
  matchesProviderAssignee,
  normalizeProviderAssigneeCandidates,
} from "./tms-provider-assignee-match";

describe("tms-provider-assignee-match", () => {
  it("normalizes and deduplicates assignee candidates", () => {
    expect(normalizeProviderAssigneeCandidates([" Lee ", "LEE", ""])).toEqual(["lee"]);
  });

  it("matches assignees with exact normalized equality only", () => {
    expect(matchesProviderAssignee("Lee Example", ["lee example"])).toBe(true);
    expect(matchesProviderAssignee("Ashlee Johnson", ["lee"])).toBe(false);
    expect(matchesProviderAssignee("Joanna Smith", ["ann"])).toBe(false);
  });
});
