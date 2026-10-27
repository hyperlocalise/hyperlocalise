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
  CUSTOMER_IO_TREE_ACTION_FIELDS,
  CUSTOMER_IO_TREE_FIELDS,
  isCustomerIoTreeActionSelected,
  toggleCustomerIoTreeActionSelection,
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

  it("clears action picks when a resource is deselected", () => {
    const base = createDefaultWorkspaceAutomationFormState();
    const withAction = toggleCustomerIoTreeActionSelection(base, "broadcast", "3", "a1", [
      "a1",
      "a2",
    ]);
    expect(withAction.customerIoBroadcastIds).toEqual(["3"]);

    const removed = toggleCustomerIoTreeSelection(withAction, "broadcast", "3");
    expect(removed.customerIoBroadcastIds).toEqual([]);
    expect(removed.customerIoBroadcastActions).toEqual({});
  });
});

describe("toggleCustomerIoTreeActionSelection", () => {
  it("maps each tree kind to its action field", () => {
    expect(CUSTOMER_IO_TREE_ACTION_FIELDS).toEqual({
      broadcast: "customerIoBroadcastActions",
      campaign: "customerIoCampaignActions",
      newsletter: "customerIoNewsletterActions",
      transactional: "customerIoTransactionalMessageActions",
    });
  });

  it("selects a lone action and its parent resource", () => {
    const base = createDefaultWorkspaceAutomationFormState();
    const next = toggleCustomerIoTreeActionSelection(base, "newsletter", "9", "n1", ["n1", "n2"]);

    expect(next.customerIoNewsletterIds).toEqual(["9"]);
    expect(next.customerIoNewsletterActions).toEqual({ "9": ["n1"] });
    expect(isCustomerIoTreeActionSelected(next, "newsletter", "9", "n1")).toBe(true);
    expect(isCustomerIoTreeActionSelected(next, "newsletter", "9", "n2")).toBe(false);
  });

  it("narrows an implicitly fully-selected resource when one action is unticked", () => {
    const base = createDefaultWorkspaceAutomationFormState();
    const all = toggleCustomerIoTreeSelection(base, "campaign", "7");
    const narrowed = toggleCustomerIoTreeActionSelection(all, "campaign", "7", "c1", ["c1", "c2"]);

    expect(narrowed.customerIoCampaignIds).toEqual(["7"]);
    expect(narrowed.customerIoCampaignActions).toEqual({ "7": ["c2"] });
  });

  it("deselects the resource when its last action is unticked", () => {
    const base = createDefaultWorkspaceAutomationFormState();
    const one = toggleCustomerIoTreeActionSelection(base, "transactional", "5", "t1", ["t1", "t2"]);
    const none = toggleCustomerIoTreeActionSelection(one, "transactional", "5", "t1", ["t1", "t2"]);

    expect(none.customerIoTransactionalMessageIds).toEqual([]);
    expect(none.customerIoTransactionalMessageActions).toEqual({});
    expect(isCustomerIoTreeActionSelected(none, "transactional", "5", "t1")).toBe(false);
  });
});
