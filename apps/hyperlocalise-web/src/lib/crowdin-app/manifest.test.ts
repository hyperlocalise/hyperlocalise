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

import { buildCrowdinAppManifest } from "./manifest";

describe("buildCrowdinAppManifest", () => {
  it("exposes the inbox in the project menu and editor right panel", () => {
    const manifest = buildCrowdinAppManifest();

    expect(manifest.modules["project-menu"]).toEqual([
      {
        key: "inbox",
        name: "Hyperlocalise",
        url: "/crowdin-app/inbox",
      },
    ]);
    expect(manifest.modules["editor-right-panel"]).toEqual([
      {
        key: "inbox-editor",
        name: "Hyperlocalise",
        modes: ["translate"],
        supportsMultipleStrings: false,
        url: "/crowdin-app/inbox",
      },
    ]);
  });
});
