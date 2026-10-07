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
  INTERCOM_IMPORT_STALE_CONFIG,
  INTERCOM_PUSH_STALE_CONFIG,
  IntercomSyncStaleConfigError,
  buildIntercomImportScopeKey,
  encodeIntercomImportScopeCursor,
  intercomArticleInConfiguredCollections,
  intercomMappingMatchesTarget,
  isIntercomSyncStaleConfigError,
  readIntercomImportScopeCursor,
  readLiveIntercomOverwriteDrafts,
  readLiveIntercomScopeKey,
  resolveIntercomAutomationFreshness,
  resolveIntercomAutomationScopeFreshness,
} from "./intercom-sync-scope";

describe("intercom sync scope", () => {
  it("treats collection order as the same import target", () => {
    expect(
      buildIntercomImportScopeKey({
        projectId: "project-1",
        helpCenterId: "hc-1",
        collectionIds: ["52", "38"],
      }),
    ).toBe(
      buildIntercomImportScopeKey({
        projectId: "project-1",
        helpCenterId: "hc-1",
        collectionIds: ["38", "52"],
      }),
    );
  });

  it("round-trips the stored import scope cursor", () => {
    const scopeKey = buildIntercomImportScopeKey({
      projectId: "project-1",
      helpCenterId: "hc-1",
      collectionIds: ["38"],
    });

    expect(readIntercomImportScopeCursor(encodeIntercomImportScopeCursor(scopeKey))).toBe(scopeKey);
    expect(readIntercomImportScopeCursor("next-page-token")).toBeNull();
  });

  it("keeps mappings only for the current project and Help Center", () => {
    expect(
      intercomMappingMatchesTarget(
        { projectId: "project-1", helpCenterId: "hc-1" },
        { projectId: "project-1", helpCenterId: "hc-1" },
      ),
    ).toBe(true);
    expect(
      intercomMappingMatchesTarget(
        { projectId: "project-1", helpCenterId: "hc-1" },
        { projectId: "project-2", helpCenterId: "hc-1" },
      ),
    ).toBe(false);
  });

  it("treats an empty collection filter as the whole Help Center", () => {
    expect(intercomArticleInConfiguredCollections([38], [])).toBe(true);
    expect(intercomArticleInConfiguredCollections([38], ["52"])).toBe(false);
    expect(intercomArticleInConfiguredCollections([52], ["52"])).toBe(true);
  });

  it("treats a matching version and scope as current", () => {
    const scopeKey = buildIntercomImportScopeKey({
      projectId: "project-1",
      helpCenterId: "hc-1",
      collectionIds: ["38"],
    });

    expect(
      resolveIntercomAutomationFreshness({
        snapshotConfigVersion: 3,
        snapshotScopeKey: scopeKey,
        liveConfigVersion: 3,
        liveScopeKey: scopeKey,
      }),
    ).toBe("current");
  });

  it("rejects a newer config version even when the scope string matches", () => {
    const scopeKey = buildIntercomImportScopeKey({
      projectId: "project-1",
      helpCenterId: "hc-1",
      collectionIds: ["38"],
    });

    expect(
      resolveIntercomAutomationFreshness({
        snapshotConfigVersion: 3,
        snapshotScopeKey: scopeKey,
        liveConfigVersion: 4,
        liveScopeKey: scopeKey,
      }),
    ).toBe("stale");
  });

  it("rejects a live project or Help Center that no longer matches the run", () => {
    expect(
      resolveIntercomAutomationFreshness({
        snapshotConfigVersion: 3,
        snapshotScopeKey: buildIntercomImportScopeKey({
          projectId: "project-1",
          helpCenterId: "hc-1",
          collectionIds: ["38"],
        }),
        liveConfigVersion: 3,
        liveScopeKey: buildIntercomImportScopeKey({
          projectId: "project-2",
          helpCenterId: "hc-1",
          collectionIds: ["38"],
        }),
      }),
    ).toBe("stale");
  });

  it("treats a matching live scope as current even when config version is ignored", () => {
    const scopeKey = buildIntercomImportScopeKey({
      projectId: "project-1",
      helpCenterId: "hc-1",
      collectionIds: ["38"],
    });

    expect(
      resolveIntercomAutomationScopeFreshness({
        snapshotScopeKey: scopeKey,
        liveScopeKey: scopeKey,
      }),
    ).toBe("current");
    expect(
      resolveIntercomAutomationScopeFreshness({
        snapshotScopeKey: scopeKey,
        liveScopeKey: buildIntercomImportScopeKey({
          projectId: "project-2",
          helpCenterId: "hc-1",
          collectionIds: ["38"],
        }),
      }),
    ).toBe("stale");
  });

  it("rejects a missing automation or incomplete live scope", () => {
    const scopeKey = buildIntercomImportScopeKey({
      projectId: "project-1",
      helpCenterId: "hc-1",
      collectionIds: ["38"],
    });

    expect(
      resolveIntercomAutomationFreshness({
        snapshotConfigVersion: 3,
        snapshotScopeKey: scopeKey,
        liveConfigVersion: null,
        liveScopeKey: null,
      }),
    ).toBe("stale");
    expect(
      resolveIntercomAutomationFreshness({
        snapshotConfigVersion: 3,
        snapshotScopeKey: scopeKey,
        liveConfigVersion: 3,
        liveScopeKey: null,
      }),
    ).toBe("stale");
  });

  it("reads the live import scope from automation tool config", () => {
    expect(
      readLiveIntercomScopeKey({
        projectId: "project-1",
        toolConfig: {
          intercom: {
            helpCenterId: "hc-1",
            collectionIds: ["52", "38"],
          },
        },
      }),
    ).toBe(
      buildIntercomImportScopeKey({
        projectId: "project-1",
        helpCenterId: "hc-1",
        collectionIds: ["38", "52"],
      }),
    );
    expect(
      readLiveIntercomScopeKey({
        projectId: "project-1",
        toolConfig: { intercom: { enabled: true } },
      }),
    ).toBeNull();
  });

  it("reads the live overwrite-drafts setting from automation tool config", () => {
    expect(
      readLiveIntercomOverwriteDrafts({
        intercom: { overwriteIntercomDrafts: true },
      }),
    ).toBe(true);
    expect(
      readLiveIntercomOverwriteDrafts({
        intercom: { overwriteIntercomDrafts: false },
      }),
    ).toBe(false);
    expect(readLiveIntercomOverwriteDrafts({ intercom: { enabled: true } })).toBeNull();
  });

  it("recognizes stale-config errors from import and push", () => {
    expect(
      isIntercomSyncStaleConfigError(
        new IntercomSyncStaleConfigError(INTERCOM_IMPORT_STALE_CONFIG),
      ),
    ).toBe(true);
    expect(
      isIntercomSyncStaleConfigError(new IntercomSyncStaleConfigError(INTERCOM_PUSH_STALE_CONFIG)),
    ).toBe(true);
    expect(isIntercomSyncStaleConfigError(new Error(INTERCOM_IMPORT_STALE_CONFIG))).toBe(false);
    expect(isIntercomSyncStaleConfigError(new Error("intercom_upload_failed"))).toBe(false);
  });
});
