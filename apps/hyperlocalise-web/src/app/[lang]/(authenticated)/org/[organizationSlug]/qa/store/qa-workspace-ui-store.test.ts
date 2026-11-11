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

import { QaWorkspaceUiStore } from "./qa-workspace-ui-store";

describe("QaWorkspaceUiStore", () => {
  it("treats a selected project as an active filter and clears it with finding filters", () => {
    const store = new QaWorkspaceUiStore("acme");
    store.setProjectId("project_docs");
    store.setLocale("fr-FR");
    store.setTab("projects");

    expect(store.isFiltered).toBe(true);

    store.clearFilters();
    expect(store.projectId).toBe(QA_FILTER_ALL);
    expect(store.locale).toBe(QA_FILTER_ALL);
    expect(store.isFiltered).toBe(false);
    expect(store.tab).toBe("projects");
  });

  it("focuses findings from the overview and keeps the current severity", () => {
    const store = new QaWorkspaceUiStore("acme");
    store.setSeverity("error");
    store.setTab("projects");

    store.showFindingsFor({
      projectId: "project_web",
      locale: "de-DE",
      checkType: "placeholder_mismatch",
    });

    expect(store.projectId).toBe("project_web");
    expect(store.locale).toBe("de-DE");
    expect(store.checkType).toBe("placeholder_mismatch");
    expect(store.severity).toBe("error");
    expect(store.tab).toBe("findings");
  });
});
