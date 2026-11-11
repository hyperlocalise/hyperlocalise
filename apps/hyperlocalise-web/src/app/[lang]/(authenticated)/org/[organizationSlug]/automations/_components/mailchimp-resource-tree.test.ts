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

import { createDefaultWorkspaceAutomationFormState } from "@/lib/agents/workspace-automation-view-model";

import {
  MAILCHIMP_TREE_FIELDS,
  pruneMailchimpTreeSelection,
  toggleMailchimpTreeSelection,
} from "./mailchimp-resource-tree";

describe("toggleMailchimpTreeSelection", () => {
  it("maps each tree kind to its form field", () => {
    expect(MAILCHIMP_TREE_FIELDS).toEqual({
      campaign: "mailchimpCampaignIds",
      template: "mailchimpTemplateIds",
    });
  });

  it("toggles template ids without touching campaigns", () => {
    const base = createDefaultWorkspaceAutomationFormState();
    const added = toggleMailchimpTreeSelection(base, "template", "10000141");
    expect(added.mailchimpTemplateIds).toEqual(["10000141"]);
    expect(added.mailchimpCampaignIds).toEqual([]);

    const removed = toggleMailchimpTreeSelection(added, "template", "10000141");
    expect(removed.mailchimpTemplateIds).toEqual([]);
  });
});

describe("pruneMailchimpTreeSelection", () => {
  it("removes stale template ids and leaves the form unchanged when nothing matches", () => {
    const base = createDefaultWorkspaceAutomationFormState();
    const withTemplates = {
      ...base,
      mailchimpTemplateIds: ["html-1", "10000141", "10000142"],
      mailchimpCampaignIds: ["c1"],
    };

    const pruned = pruneMailchimpTreeSelection(withTemplates, "template", ["10000141", "10000142"]);
    expect(pruned.mailchimpTemplateIds).toEqual(["html-1"]);
    expect(pruned.mailchimpCampaignIds).toEqual(["c1"]);

    const unchanged = pruneMailchimpTreeSelection(withTemplates, "template", ["missing"]);
    expect(unchanged).toBe(withTemplates);
  });
});
