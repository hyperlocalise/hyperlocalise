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
  applyQaFindingFocus,
  DEFAULT_QA_STATUS_FILTER,
  emptyQaFindingFilters,
  hasQaFindingFilters,
  QA_FILTER_ALL,
} from "./qa-filters-store";

describe("QA finding filter helpers", () => {
  it("treats the default open status as unfiltered", () => {
    expect(emptyQaFindingFilters()).toEqual({
      locale: QA_FILTER_ALL,
      checkType: QA_FILTER_ALL,
      severity: QA_FILTER_ALL,
      status: DEFAULT_QA_STATUS_FILTER,
    });
    expect(hasQaFindingFilters(emptyQaFindingFilters())).toBe(false);
  });

  it("counts locale, check, severity, or a non-default status as active", () => {
    expect(hasQaFindingFilters({ ...emptyQaFindingFilters(), locale: "fr-FR" })).toBe(true);
    expect(hasQaFindingFilters({ ...emptyQaFindingFilters(), checkType: "spelling" })).toBe(true);
    expect(hasQaFindingFilters({ ...emptyQaFindingFilters(), severity: "error" })).toBe(true);
    expect(hasQaFindingFilters({ ...emptyQaFindingFilters(), status: "ignored" })).toBe(true);
  });

  it("applies an overview focus and switches to findings without clearing other filters", () => {
    const target = { ...emptyQaFindingFilters(), severity: "warning", tab: "projects" };

    applyQaFindingFocus(target, { locale: "de-DE", checkType: "length" });

    expect(target.locale).toBe("de-DE");
    expect(target.checkType).toBe("length");
    expect(target.severity).toBe("warning");
    expect(target.tab).toBe("findings");
  });
});
