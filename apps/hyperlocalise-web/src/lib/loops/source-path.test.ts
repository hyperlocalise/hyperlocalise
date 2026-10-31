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

import {
  isLoopsCampaignSourcePath,
  isLoopsSourcePath,
  isLoopsTransactionalSourcePath,
  isLoopsWorkflowSourcePath,
} from "./source-path";

describe("loops source paths", () => {
  it("matches every loops path", () => {
    expect(isLoopsSourcePath("loops/transactional/a.html")).toBe(true);
    expect(isLoopsSourcePath("loops/campaigns/a.html")).toBe(true);
    expect(isLoopsSourcePath("loops/workflows/a/b.html")).toBe(true);
    expect(isLoopsSourcePath("braze/templates/a.html")).toBe(false);
  });

  it("distinguishes transactional, campaign, and workflow paths", () => {
    expect(isLoopsTransactionalSourcePath("loops/transactional/a.html")).toBe(true);
    expect(isLoopsTransactionalSourcePath("loops/campaigns/a.html")).toBe(false);
    expect(isLoopsCampaignSourcePath("loops/campaigns/a.html")).toBe(true);
    expect(isLoopsCampaignSourcePath("loops/transactional/a.html")).toBe(false);
    expect(isLoopsWorkflowSourcePath("loops/workflows/a/b.html")).toBe(true);
    expect(isLoopsWorkflowSourcePath("loops/transactional/a.html")).toBe(false);
  });
});
