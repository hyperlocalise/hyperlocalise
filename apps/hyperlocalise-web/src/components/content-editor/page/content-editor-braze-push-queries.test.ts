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
  isBrazeCampaignSourcePath,
  isBrazeSourcePath,
  isBrazeTemplateSourcePath,
} from "@/lib/braze/source-paths";

import {
  brazeItemTitleFromSourcePath,
  defaultSelectedBrazePushSourcePaths,
  type ContentEditorBrazePushItem,
} from "./content-editor-braze-push-queries";

const items: ContentEditorBrazePushItem[] = [
  {
    sourceId: "1",
    sourcePath: "braze/templates/welcome-email.html",
    resourceKind: "email_template",
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
    sourceId: "2",
    sourcePath: "braze/content-blocks/hero-promo.html",
    resourceKind: "content_block",
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

describe("defaultSelectedBrazePushSourcePaths", () => {
  it("checks the open file when it is mapped", () => {
    expect(
      defaultSelectedBrazePushSourcePaths(items, "braze/templates/welcome-email.html"),
    ).toEqual(["braze/templates/welcome-email.html"]);
  });

  it("selects nothing when the open path is missing", () => {
    expect(defaultSelectedBrazePushSourcePaths(items, null)).toEqual([]);
    expect(defaultSelectedBrazePushSourcePaths(items, "braze/templates/missing.html")).toEqual([]);
  });
});

describe("brazeItemTitleFromSourcePath", () => {
  it("uses the HTML filename", () => {
    expect(brazeItemTitleFromSourcePath("braze/templates/welcome-email.html")).toBe(
      "welcome-email",
    );
    expect(brazeItemTitleFromSourcePath("braze/content-blocks/hero-promo.html")).toBe("hero-promo");
    expect(brazeItemTitleFromSourcePath("braze/campaigns/welcome/email-a.json")).toBe("email-a");
  });

  it("classifies Braze source paths for Push and Ingest matching", () => {
    expect(isBrazeTemplateSourcePath("braze/templates/welcome-email.html")).toBe(true);
    expect(isBrazeCampaignSourcePath("braze/campaigns/welcome/email-a.json")).toBe(true);
    expect(isBrazeCampaignSourcePath("braze/templates/welcome-email.html")).toBe(false);
    expect(isBrazeSourcePath("locales/en.json")).toBe(false);
  });
});
