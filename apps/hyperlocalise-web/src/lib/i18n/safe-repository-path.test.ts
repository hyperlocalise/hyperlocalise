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

import { isSafeRepositoryRelativePath } from "./safe-repository-path";

describe("isSafeRepositoryRelativePath", () => {
  it("accepts normal localization paths", () => {
    expect(isSafeRepositoryRelativePath("locales/en/messages.json")).toBe(true);
  });

  it("rejects traversal and git paths", () => {
    expect(isSafeRepositoryRelativePath("../secrets.json")).toBe(false);
    expect(isSafeRepositoryRelativePath(".git/config")).toBe(false);
    expect(isSafeRepositoryRelativePath("/etc/passwd")).toBe(false);
  });
});
