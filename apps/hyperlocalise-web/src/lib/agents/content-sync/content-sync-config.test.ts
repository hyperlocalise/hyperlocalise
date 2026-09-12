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

import { isErr, isOk } from "@/lib/primitives/result/results";

import {
  resolveContentSyncRepositoryTarget,
  resolveContentSyncTriggerConfig,
  validateContentSyncConfig,
} from "./content-sync-config";
import type { ContentSyncConfig } from "./content-sync-types";

const githubConfig: ContentSyncConfig = {
  provider: "github",
  connectionId: "22222222-2222-4222-8222-222222222222",
  resourceKey: "acme/web",
  providerFolder: "locales",
  projectFolder: "github/acme/web",
};

describe("content sync config", () => {
  it("defaults GitHub triggers to every push branch", () => {
    expect(resolveContentSyncTriggerConfig(githubConfig)).toEqual({
      mode: "github",
      branches: ["**"],
      events: ["push"],
    });
    expect(resolveContentSyncRepositoryTarget(githubConfig)).toEqual({
      kind: "github",
      githubInstallationRepositoryId: githubConfig.connectionId,
    });
  });

  it("requires a provider folder for git and a project folder for every provider", () => {
    const missingProviderFolder = validateContentSyncConfig({
      ...githubConfig,
      providerFolder: "",
    });
    expect(isErr(missingProviderFolder)).toBe(true);
    if (isErr(missingProviderFolder)) {
      expect(missingProviderFolder.error.code).toBe("content_sync_provider_folder_required");
    }

    const missingProjectFolder = validateContentSyncConfig({
      ...githubConfig,
      projectFolder: "",
    });
    expect(isErr(missingProjectFolder)).toBe(true);

    const contentful = validateContentSyncConfig({
      provider: "contentful",
      connectionId: githubConfig.connectionId,
      resourceKey: "space-1",
      providerFolder: "",
      projectFolder: "contentful/space-1",
    });
    expect(isOk(contentful)).toBe(true);
  });
});
