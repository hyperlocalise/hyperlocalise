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

import { isGitMetadataPath, normalizeWorkspacePath } from "./path";

describe("isGitMetadataPath", () => {
  it("rejects the git directory and files under it", () => {
    expect(isGitMetadataPath(".git")).toBe(true);
    expect(isGitMetadataPath(".git/config")).toBe(true);
    expect(isGitMetadataPath("./.git/hooks/pre-commit")).toBe(true);
    expect(isGitMetadataPath("vendor/lib/.git/config")).toBe(true);
  });

  it("allows ordinary git-dotfiles and source paths", () => {
    expect(isGitMetadataPath(".gitignore")).toBe(false);
    expect(isGitMetadataPath(".gitattributes")).toBe(false);
    expect(isGitMetadataPath(".github/workflows/ci.yml")).toBe(false);
    expect(isGitMetadataPath("src/app.tsx")).toBe(false);
  });
});

describe("normalizeWorkspacePath", () => {
  it("keeps workspace-relative source paths", () => {
    expect(normalizeWorkspacePath("./src/app.tsx")).toBe("src/app.tsx");
  });

  it("rejects traversal and absolute paths", () => {
    expect(normalizeWorkspacePath("../secret")).toBeNull();
    expect(normalizeWorkspacePath("/etc/passwd")).toBeNull();
  });
});
