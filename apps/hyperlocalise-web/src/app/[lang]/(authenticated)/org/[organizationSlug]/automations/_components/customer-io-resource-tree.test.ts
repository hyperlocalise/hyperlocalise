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
  CUSTOMER_IO_TREE_FIELDS,
  toggleCustomerIoTreeSelection,
} from "./customer-io-resource-tree";

describe("toggleCustomerIoTreeSelection", () => {
  it("maps each tree kind to its form field", () => {
    expect(CUSTOMER_IO_TREE_FIELDS).toEqual({
      broadcast: "customerIoBroadcastIds",
      campaign: "customerIoCampaignIds",
      newsletter: "customerIoNewsletterIds",
      transactional: "customerIoTransactionalMessageIds",
    });
  });

  it("toggles ids per kind without touching other fields", () => {
    const base = createDefaultWorkspaceAutomationFormState();

    const added = toggleCustomerIoTreeSelection(base, "campaign", "7");
    expect(added.customerIoCampaignIds).toEqual(["7"]);
    expect(added.customerIoBroadcastIds).toEqual([]);

    const addedAgain = toggleCustomerIoTreeSelection(added, "transactional", "5");
    expect(addedAgain.customerIoTransactionalMessageIds).toEqual(["5"]);
    expect(addedAgain.customerIoCampaignIds).toEqual(["7"]);

    const removed = toggleCustomerIoTreeSelection(addedAgain, "campaign", "7");
    expect(removed.customerIoCampaignIds).toEqual([]);
    expect(removed.customerIoTransactionalMessageIds).toEqual(["5"]);
  });
});
