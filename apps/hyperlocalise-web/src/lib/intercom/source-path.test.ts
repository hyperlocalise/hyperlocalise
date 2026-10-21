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

import { isGoogleDriveSourcePath } from "@/lib/google-drive/constants";

import { isIntercomSourcePath } from "./source-path";

describe("integration CAT source paths", () => {
  it("matches Intercom article files only", () => {
    expect(isIntercomSourcePath("intercom/help/getting-started.md")).toBe(true);
    expect(isIntercomSourcePath("locales/en.json")).toBe(false);
    expect(isIntercomSourcePath("google-drive/root/overview.docx")).toBe(false);
  });

  it("matches Google Drive imported files only", () => {
    expect(isGoogleDriveSourcePath("google-drive/root/Campaigns/overview.docx")).toBe(true);
    expect(isGoogleDriveSourcePath("docs/overview.docx")).toBe(false);
    expect(isGoogleDriveSourcePath("intercom/help/getting-started.md")).toBe(false);
  });
});
