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
  brazeItemTitleFromSourcePath,
  defaultSelectedBrazePushSourcePaths,
  type ContentEditorBrazePushItem,
} from "./content-editor-braze-push-queries";

const items: ContentEditorBrazePushItem[] = [
  {
    sourceId: "1",
    sourcePath: "braze/email/welcome-email.html",
    resourceKind: "email_template",
    status: "active",
    eligibleLocaleCount: 1,
    targetLocaleCount: 2,
    eligibleLocales: ["fr"],
    lastPushedAt: null,
    lastError: null,
  },
  {
    sourceId: "2",
    sourcePath: "braze/content-block/hero-promo.html",
    resourceKind: "content_block",
    status: "active",
    eligibleLocaleCount: 0,
    targetLocaleCount: 2,
    eligibleLocales: [],
    lastPushedAt: null,
    lastError: null,
  },
];

describe("defaultSelectedBrazePushSourcePaths", () => {
  it("checks the open file when it is mapped", () => {
    expect(defaultSelectedBrazePushSourcePaths(items, "braze/email/welcome-email.html")).toEqual([
      "braze/email/welcome-email.html",
    ]);
  });

  it("selects nothing when the open path is missing", () => {
    expect(defaultSelectedBrazePushSourcePaths(items, null)).toEqual([]);
    expect(defaultSelectedBrazePushSourcePaths(items, "braze/email/missing.html")).toEqual([]);
  });
});

describe("brazeItemTitleFromSourcePath", () => {
  it("uses the HTML filename", () => {
    expect(brazeItemTitleFromSourcePath("braze/email/welcome-email.html")).toBe("welcome-email");
    expect(brazeItemTitleFromSourcePath("braze/content-block/hero-promo.html")).toBe("hero-promo");
  });
});
