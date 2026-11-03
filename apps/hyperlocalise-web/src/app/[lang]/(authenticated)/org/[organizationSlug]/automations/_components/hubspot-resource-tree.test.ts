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

import { HUBSPOT_TREE_FIELDS, toggleHubspotTreeSelection } from "./hubspot-resource-tree";

describe("toggleHubspotTreeSelection", () => {
  it("maps each tree kind to its form field", () => {
    expect(HUBSPOT_TREE_FIELDS).toEqual({
      email: "hubspotEmailIds",
      form: "hubspotFormIds",
      blog: "hubspotBlogPostIds",
      "landing-page": "hubspotLandingPageIds",
      "website-page": "hubspotWebsitePageIds",
      "message-template": "hubspotMessageTemplateIds",
    });
  });

  it("toggles ids per kind without touching other fields", () => {
    const base = createDefaultWorkspaceAutomationFormState();

    const added = toggleHubspotTreeSelection(base, "landing-page", "page-1");
    expect(added.hubspotLandingPageIds).toEqual(["page-1"]);
    expect(added.hubspotEmailIds).toEqual([]);

    const addedAgain = toggleHubspotTreeSelection(added, "website-page", "home");
    expect(addedAgain.hubspotWebsitePageIds).toEqual(["home"]);
    expect(addedAgain.hubspotLandingPageIds).toEqual(["page-1"]);

    const removed = toggleHubspotTreeSelection(addedAgain, "landing-page", "page-1");
    expect(removed.hubspotLandingPageIds).toEqual([]);
    expect(removed.hubspotWebsitePageIds).toEqual(["home"]);
  });
});
