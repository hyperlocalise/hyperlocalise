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
  defaultSelectedIntercomPushSourcePaths,
  intercomArticleTitleFromSourcePath,
  type ContentEditorIntercomPushArticle,
} from "./content-editor-intercom-push-queries";

const articles: ContentEditorIntercomPushArticle[] = [
  {
    articleId: "1",
    sourcePath: "intercom/help/open.md",
    status: "active",
    eligibleLocaleCount: 1,
    targetLocaleCount: 2,
    eligibleLocales: ["de"],
    lastPushedAt: null,
    lastError: null,
  },
  {
    articleId: "2",
    sourcePath: "intercom/help/other.md",
    status: "active",
    eligibleLocaleCount: 0,
    targetLocaleCount: 2,
    eligibleLocales: [],
    lastPushedAt: null,
    lastError: null,
  },
];

describe("defaultSelectedIntercomPushSourcePaths", () => {
  it("checks the open article when it is mapped", () => {
    expect(defaultSelectedIntercomPushSourcePaths(articles, "intercom/help/open.md")).toEqual([
      "intercom/help/open.md",
    ]);
  });

  it("selects nothing when the open path is missing", () => {
    expect(defaultSelectedIntercomPushSourcePaths(articles, null)).toEqual([]);
    expect(defaultSelectedIntercomPushSourcePaths(articles, "intercom/help/missing.md")).toEqual(
      [],
    );
  });
});

describe("intercomArticleTitleFromSourcePath", () => {
  it("uses the markdown filename", () => {
    expect(intercomArticleTitleFromSourcePath("intercom/help/reset-your-password.md")).toBe(
      "reset-your-password",
    );
  });
});
