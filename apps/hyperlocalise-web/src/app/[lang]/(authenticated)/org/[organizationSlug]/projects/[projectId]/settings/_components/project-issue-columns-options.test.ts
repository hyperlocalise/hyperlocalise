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
  mergeSelectOptionsFromLabels,
  optionsToCsv,
  parseOptionLabelsCsv,
  selectOptionsFromLabels,
} from "./project-issue-columns-options";

const existing = [
  { id: "s24", label: "Sprint 24", color: "blue" },
  { id: "backlog", label: "Backlog", color: "slate" },
];

describe("project-issue-columns-options", () => {
  it("parses and serializes option labels", () => {
    expect(parseOptionLabelsCsv(" Sprint 24, Backlog , ")).toEqual(["Sprint 24", "Backlog"]);
    expect(optionsToCsv(existing)).toBe("Sprint 24, Backlog");
  });

  it("creates new options from labels", () => {
    expect(selectOptionsFromLabels(["Sprint 24", "Backlog"])).toEqual([
      { id: "Sprint 24", label: "Sprint 24" },
      { id: "Backlog", label: "Backlog" },
    ]);
  });

  it("keeps stable ids and colors when a label is renamed", () => {
    expect(mergeSelectOptionsFromLabels(existing, ["Sprint 25", "Backlog"])).toEqual([
      { id: "s24", label: "Sprint 25", color: "blue" },
      { id: "backlog", label: "Backlog", color: "slate" },
    ]);
  });

  it("keeps stable ids when options are reordered", () => {
    expect(mergeSelectOptionsFromLabels(existing, ["Backlog", "Sprint 24"])).toEqual([
      { id: "backlog", label: "Backlog", color: "slate" },
      { id: "s24", label: "Sprint 24", color: "blue" },
    ]);
  });

  it("treats an unmatched replacement as a relabel of the leftover option", () => {
    expect(mergeSelectOptionsFromLabels(existing, ["Sprint 24", "Blocked"])).toEqual([
      { id: "s24", label: "Sprint 24", color: "blue" },
      { id: "backlog", label: "Blocked", color: "slate" },
    ]);
  });

  it("adds a new option when the list grows", () => {
    expect(mergeSelectOptionsFromLabels(existing, ["Sprint 24", "Backlog", "Blocked"])).toEqual([
      { id: "s24", label: "Sprint 24", color: "blue" },
      { id: "backlog", label: "Backlog", color: "slate" },
      { id: "Blocked", label: "Blocked" },
    ]);
  });

  it("drops removed options when the list shrinks", () => {
    expect(mergeSelectOptionsFromLabels(existing, ["Sprint 24"])).toEqual([
      { id: "s24", label: "Sprint 24", color: "blue" },
    ]);
  });
});
