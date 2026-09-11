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
  buildContentSyncFingerprint,
  joinContentSyncPath,
  relativizeContentSyncPath,
  rewriteContentSyncProviderPath,
  rewriteContentSyncSourcePath,
} from "./content-sync-paths";
import { validateContentSyncConfig } from "./content-sync-config";
import { isErr, isOk } from "@/lib/primitives/result/results";

describe("content sync paths", () => {
  it("normalizes folders and rewrites project paths", () => {
    expect(joinContentSyncPath("github/web/", "en.json")).toBe("github/web/en.json");
    expect(relativizeContentSyncPath("locales", "locales/en.json")).toBe("en.json");
    expect(
      rewriteContentSyncSourcePath({
        sandboxPath: "locales/en.json",
        providerFolder: "locales",
        projectFolder: "github/web",
      }),
    ).toBe("github/web/en.json");
    expect(
      rewriteContentSyncProviderPath({
        projectPath: "github/web/en.json",
        providerFolder: "locales",
        projectFolder: "github/web",
      }),
    ).toBe("locales/en.json");
  });

  it("builds a stable fingerprint for uniqueness", () => {
    expect(
      buildContentSyncFingerprint({
        provider: "github",
        resourceKey: "acme/web",
        providerFolder: "/locales/",
      }),
    ).toBe(
      buildContentSyncFingerprint({
        provider: "github",
        resourceKey: "acme/web",
        providerFolder: "locales",
      }),
    );
  });

  it("requires a provider folder for git sources", () => {
    const result = validateContentSyncConfig({
      provider: "github",
      connectionId: "11111111-1111-4111-8111-111111111111",
      resourceKey: "acme/web",
      providerFolder: "",
      projectFolder: "github/web",
    });
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe("content_sync_provider_folder_required");
    }
  });

  it("accepts a CMS sync without a provider folder", () => {
    const result = validateContentSyncConfig({
      provider: "contentful",
      connectionId: "11111111-1111-4111-8111-111111111111",
      resourceKey: "space",
      providerFolder: "",
      projectFolder: "contentful/help",
    });
    expect(isOk(result)).toBe(true);
  });
});
