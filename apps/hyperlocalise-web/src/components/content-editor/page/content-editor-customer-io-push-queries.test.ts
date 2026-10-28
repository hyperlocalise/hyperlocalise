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

import { isCustomerIoSourcePath } from "@/lib/customer-io/source-path";

import {
  defaultSelectedCustomerIoPushSourcePaths,
  type ContentEditorCustomerIoPushItem,
} from "./content-editor-customer-io-push-queries";

const items: ContentEditorCustomerIoPushItem[] = [
  {
    sourceId: "1/a1",
    sourcePath: "customer-io/broadcasts/1/actions/a1.json",
    resourceKind: "broadcast",
    name: "Welcome — Welcome email",
    status: "active",
    eligibleLocaleCount: 1,
    targetLocaleCount: 2,
    eligibleLocales: ["fr"],
    locales: [
      { locale: "fr", translationProgress: 100, approvalProgress: 100 },
      { locale: "de", translationProgress: 100, approvalProgress: 0 },
    ],
    lastPushedAt: null,
    lastError: null,
  },
  {
    sourceId: "2/a2",
    sourcePath: "customer-io/campaigns/2/actions/a2.json",
    resourceKind: "campaign",
    name: "Onboarding — Day one email",
    status: "active",
    eligibleLocaleCount: 0,
    targetLocaleCount: 2,
    eligibleLocales: [],
    locales: [
      { locale: "fr", translationProgress: 50, approvalProgress: 0 },
      { locale: "de", translationProgress: 50, approvalProgress: 0 },
    ],
    lastPushedAt: null,
    lastError: null,
  },
];

describe("defaultSelectedCustomerIoPushSourcePaths", () => {
  it("checks the open file when it is mapped", () => {
    expect(
      defaultSelectedCustomerIoPushSourcePaths(items, "customer-io/broadcasts/1/actions/a1.json"),
    ).toEqual(["customer-io/broadcasts/1/actions/a1.json"]);
  });

  it("selects nothing when the open path is missing", () => {
    expect(defaultSelectedCustomerIoPushSourcePaths(items, null)).toEqual([]);
    expect(
      defaultSelectedCustomerIoPushSourcePaths(items, "customer-io/broadcasts/9/actions/a9.json"),
    ).toEqual([]);
  });
});

describe("isCustomerIoSourcePath", () => {
  it("matches Customer.io message paths for Push and Ingest matching", () => {
    expect(isCustomerIoSourcePath("customer-io/broadcasts/1/actions/a1.json")).toBe(true);
    expect(isCustomerIoSourcePath("customer-io/newsletters/2/contents/c3.json")).toBe(true);
    expect(isCustomerIoSourcePath("braze/templates/welcome-email.html")).toBe(false);
    expect(isCustomerIoSourcePath("locales/en.json")).toBe(false);
  });
});
