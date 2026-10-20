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

import type { WorkspaceAutomationToolConfig } from "@/lib/agents/workspace-automation-types";

import {
  buildSanityImportScopeKey,
  encodeSanityImportScopeCursor,
  isSanitySyncStaleConfigError,
  readLiveSanityOverwriteDrafts,
  readLiveSanityScopeKey,
  readSanityImportScopeCursor,
  resolveSanityAutomationFreshness,
  resolveSanityAutomationScopeFreshness,
  sanityMappingMatchesTarget,
  SanitySyncStaleConfigError,
} from "./sanity-sync-scope";
import { SANITY_IMPORT_STALE_CONFIG, SANITY_PUSH_STALE_CONFIG } from "./constants";

function toolConfig(sanity: Record<string, unknown>): WorkspaceAutomationToolConfig {
  return { sanity } as WorkspaceAutomationToolConfig;
}

describe("buildSanityImportScopeKey", () => {
  it("trims ids and sorts unique document types", () => {
    expect(
      buildSanityImportScopeKey({
        nativeProjectId: " project-1 ",
        sanityProjectId: " abc123 ",
        dataset: " production ",
        documentTypes: [" page ", "author", "page", "", "  "],
      }),
    ).toBe("project-1|abc123|production|author,page");
  });
});

describe("readLiveSanityScopeKey", () => {
  it("returns null when the native project or Sanity target is missing", () => {
    expect(
      readLiveSanityScopeKey({ projectId: null, toolConfig: toolConfig({ enabled: true }) }),
    ).toBe(null);
    expect(
      readLiveSanityScopeKey({
        projectId: "project-1",
        toolConfig: toolConfig({ enabled: true, projectId: "abc123" }),
      }),
    ).toBe(null);
    expect(readLiveSanityScopeKey({ projectId: "project-1", toolConfig: null })).toBe(null);
  });

  it("builds a live key from the current automation config", () => {
    expect(
      readLiveSanityScopeKey({
        projectId: "project-1",
        toolConfig: toolConfig({
          enabled: true,
          projectId: "abc123",
          dataset: "production",
          documentTypes: ["page", "author"],
        }),
      }),
    ).toBe("project-1|abc123|production|author,page");
  });
});

describe("readLiveSanityOverwriteDrafts", () => {
  it("returns the configured overwrite flag only when it is a boolean", () => {
    expect(readLiveSanityOverwriteDrafts(toolConfig({ overwriteSanityDrafts: true }))).toBe(true);
    expect(readLiveSanityOverwriteDrafts(toolConfig({ overwriteSanityDrafts: false }))).toBe(false);
    expect(readLiveSanityOverwriteDrafts(toolConfig({ enabled: true }))).toBe(null);
    expect(readLiveSanityOverwriteDrafts(null)).toBe(null);
  });
});

describe("sanity automation freshness", () => {
  it("is stale when the live config is missing, versioned, or scoped differently", () => {
    expect(
      resolveSanityAutomationFreshness({
        snapshotConfigVersion: 2,
        snapshotScopeKey: "project-1|abc123|production|page",
        liveConfigVersion: null,
        liveScopeKey: "project-1|abc123|production|page",
      }),
    ).toBe("stale");
    expect(
      resolveSanityAutomationFreshness({
        snapshotConfigVersion: 2,
        snapshotScopeKey: "project-1|abc123|production|page",
        liveConfigVersion: 3,
        liveScopeKey: "project-1|abc123|production|page",
      }),
    ).toBe("stale");
    expect(
      resolveSanityAutomationFreshness({
        snapshotConfigVersion: 2,
        snapshotScopeKey: "project-1|abc123|production|page",
        liveConfigVersion: 2,
        liveScopeKey: "project-1|abc123|staging|page",
      }),
    ).toBe("stale");
    expect(
      resolveSanityAutomationFreshness({
        snapshotConfigVersion: 2,
        snapshotScopeKey: "project-1|abc123|production|page",
        liveConfigVersion: 2,
        liveScopeKey: "project-1|abc123|production|page",
      }),
    ).toBe("current");
  });

  it("compares import cursors on scope only", () => {
    expect(
      resolveSanityAutomationScopeFreshness({
        snapshotScopeKey: "project-1|abc123|production|page",
        liveScopeKey: null,
      }),
    ).toBe("stale");
    expect(
      resolveSanityAutomationScopeFreshness({
        snapshotScopeKey: "project-1|abc123|production|page",
        liveScopeKey: "project-1|abc123|production|author",
      }),
    ).toBe("stale");
    expect(
      resolveSanityAutomationScopeFreshness({
        snapshotScopeKey: "project-1|abc123|production|page",
        liveScopeKey: "project-1|abc123|production|page",
      }),
    ).toBe("current");
  });
});

describe("sanity import scope cursors", () => {
  it("encodes and reads the scope: prefix", () => {
    expect(encodeSanityImportScopeCursor("project-1|abc123|production|page")).toBe(
      "scope:project-1|abc123|production|page",
    );
    expect(readSanityImportScopeCursor("scope:project-1|abc123|production|page")).toBe(
      "project-1|abc123|production|page",
    );
    expect(readSanityImportScopeCursor("project-1|abc123|production|page")).toBe(null);
    expect(readSanityImportScopeCursor("scope:")).toBe(null);
    expect(readSanityImportScopeCursor(null)).toBe(null);
  });
});

describe("sanityMappingMatchesTarget", () => {
  it("requires the native project, Sanity project, and dataset to match", () => {
    const mapping = {
      projectId: "project-1",
      sanityProjectId: "abc123",
      dataset: "production",
    };
    expect(sanityMappingMatchesTarget(mapping, mapping)).toBe(true);
    expect(sanityMappingMatchesTarget(mapping, { ...mapping, dataset: "staging" })).toBe(false);
    expect(sanityMappingMatchesTarget(mapping, { ...mapping, projectId: "project-2" })).toBe(false);
  });
});

describe("SanitySyncStaleConfigError", () => {
  it("identifies import and push stale-config errors", () => {
    const error = new SanitySyncStaleConfigError(SANITY_IMPORT_STALE_CONFIG);
    expect(isSanitySyncStaleConfigError(error)).toBe(true);
    expect(error.code).toBe(SANITY_IMPORT_STALE_CONFIG);
    expect(new SanitySyncStaleConfigError(SANITY_PUSH_STALE_CONFIG).code).toBe(
      SANITY_PUSH_STALE_CONFIG,
    );
    expect(isSanitySyncStaleConfigError(new Error("sanity_import_stale_config"))).toBe(false);
  });
});
