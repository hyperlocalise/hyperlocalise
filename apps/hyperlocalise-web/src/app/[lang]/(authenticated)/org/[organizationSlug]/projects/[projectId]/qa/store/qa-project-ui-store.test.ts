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
  it("selects an older run, clears finding filters, and returns to findings", () => {
    const store = new QaProjectUiStore("acme", "project_web");
    store.setLocale("fr-FR");
    store.setTab("history");

    store.selectRun("run_old", "run_latest");
    expect(store.selectedRunId).toBe("run_old");
    expect(store.locale).toBe(QA_FILTER_ALL);
    expect(store.isFiltered).toBe(false);
    expect(store.tab).toBe("findings");

    store.setSeverity("error");
    store.selectRun("run_latest", "run_latest");
    expect(store.selectedRunId).toBeNull();
    expect(store.severity).toBe(QA_FILTER_ALL);

    store.setLocale("de-DE");
    store.viewRun("run_previous");
    expect(store.selectedRunId).toBe("run_previous");
    expect(store.locale).toBe("de-DE");
  });

  it("resets the selected run after a new scan starts without touching policy drafts", () => {
    const store = new QaProjectUiStore("acme", "project_web");
    store.selectedRunId = "run_old";
    store.setTab("settings");
    store.updateRule(DEFAULT_QA_POLICY, "spelling", { enabled: false });

    store.resetAfterScanStart();
    expect(store.selectedRunId).toBeNull();
    expect(store.tab).toBe("findings");
    expect(store.draftPolicy?.spelling.enabled).toBe(false);
  });

  it("drafts policy rule edits from the saved policy and can discard them", () => {
    const store = new QaProjectUiStore("acme", "project_web");

    store.updateRule(DEFAULT_QA_POLICY, "length", { severity: "warning" });
    expect(store.draftPolicy?.length).toEqual({ enabled: true, severity: "warning" });
    expect(store.draftPolicy?.spelling).toEqual(DEFAULT_QA_POLICY.spelling);

    store.clearDraftPolicy();
    expect(store.draftPolicy).toBeNull();
  });
});
