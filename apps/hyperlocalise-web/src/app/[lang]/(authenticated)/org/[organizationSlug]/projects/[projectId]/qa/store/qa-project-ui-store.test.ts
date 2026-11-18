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

import { QA_FILTER_ALL } from "@/components/qa/qa-filters-store";
import { DEFAULT_QA_POLICY } from "@/lib/qa/qa-policy";

import { QaProjectUiStore } from "./qa-project-ui-store";

describe("QaProjectUiStore", () => {
  it("selects an older run and keeps finding filters for comparison", () => {
    const store = new QaProjectUiStore("acme", "project_web");
    store.setLocale("fr-FR");

    store.selectRun("run_old", "run_latest");
    expect(store.selectedRunId).toBe("run_old");
    expect(store.locale).toBe("fr-FR");

    store.selectRun("run_latest", "run_latest");
    expect(store.selectedRunId).toBeNull();
  });

  it("sets and clears finding filters by key", () => {
    const store = new QaProjectUiStore("acme", "project_web");
    store.setFilter("severity", "error");
    store.setFilter("checkType", "spelling");
    expect(store.isFiltered).toBe(true);

    store.clearFindingFilters();
    expect(store.severity).toBe(QA_FILTER_ALL);
    expect(store.checkType).toBe(QA_FILTER_ALL);
    expect(store.isFiltered).toBe(false);
  });

  it("resets the selected run after a new scan starts without touching setting drafts", () => {
    const store = new QaProjectUiStore("acme", "project_web");
    store.selectedRunId = "run_old";
    store.updateRule(DEFAULT_QA_POLICY, "spelling", { enabled: false });

    store.resetAfterScanStart();
    expect(store.selectedRunId).toBeNull();
    expect(store.draftPolicy?.spelling.enabled).toBe(false);
  });

  it("drafts schedule and rule edits together and discards them when settings close", () => {
    const store = new QaProjectUiStore("acme", "project_web");
    store.openSettings();

    store.setDraftCadence("daily");
    store.updateRule(DEFAULT_QA_POLICY, "length", { severity: "warning" });
    expect(store.hasSettingsDraft).toBe(true);
    expect(store.draftPolicy?.length).toEqual({ enabled: true, severity: "warning" });
    expect(store.draftPolicy?.spelling).toEqual(DEFAULT_QA_POLICY.spelling);

    store.closeSettings();
    expect(store.settingsOpen).toBe(false);
    expect(store.draftCadence).toBeNull();
    expect(store.draftPolicy).toBeNull();
    expect(store.hasSettingsDraft).toBe(false);
  });
});
