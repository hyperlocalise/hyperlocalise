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
import { QA_BULK_IGNORE, QaFindingsTableStore, selectQaFindings } from "./qa-findings-table-store";

describe("selectQaFindings", () => {
  const findings = [
    { id: "open" },
    { id: "linked", status: "open", issueIdentifier: "HL-1" },
    { id: "ignored", status: "ignored" },
    { id: "recheck", status: "open", needsRecheck: true },
  ];

  it("only offers open findings that do not need a recheck", () => {
    const { eligible } = selectQaFindings(findings, new Set());
    expect(eligible.map((f) => f.id)).toEqual(["open", "linked"]);
  });

  it("drops selected ids that are no longer eligible", () => {
    const { selected, promotable } = selectQaFindings(findings, new Set(["linked", "ignored"]));
    expect(selected.map((f) => f.id)).toEqual(["linked"]);
    expect(promotable).toEqual([]);
  });

  it("promotes only selected findings without an issue", () => {
    const { promotable } = selectQaFindings(findings, new Set(["open", "linked"]));
    expect(promotable.map((f) => f.id)).toEqual(["open"]);
  });
});

describe("QaFindingsTableStore", () => {
  it("selects, deselects, selects all and clears", () => {
    const store = new QaFindingsTableStore();
    store.setSelected("a", true);
    store.setSelected("b", true);
    store.setSelected("a", false);
    expect([...store.selectedIds]).toEqual(["b"]);

    store.selectAll(["c", "d"]);
    expect([...store.selectedIds]).toEqual(["c", "d"]);
    expect(store.isSelected("c")).toBe(true);

    store.clearSelection();
    expect(store.selectedIds.size).toBe(0);
  });

  it("toggles whitespace per group", () => {
    const store = new QaFindingsTableStore();
    store.toggleWhitespaceGroup("g");
    expect(store.showsWhitespace("g")).toBe(true);
    store.toggleWhitespaceGroup("g");
    expect(store.showsWhitespace("g")).toBe(false);
  });

  it("opens the ignore form with an empty reason", () => {
    const store = new QaFindingsTableStore();
    store.startIgnore("a");
    store.setReason("  ");
    expect(store.canSubmitIgnore).toBe(false);
    store.setReason("Brand term");
    expect(store.canSubmitIgnore).toBe(true);

    store.startBulkIgnore();
    expect(store.ignoringId).toBe(QA_BULK_IGNORE);
    expect(store.isBulkIgnoring).toBe(true);
    expect(store.reason).toBe("");
  });

  it("closes the form and clears the selection after a bulk ignore", () => {
    const store = new QaFindingsTableStore();
    store.selectAll(["a", "b"]);
    store.startBulkIgnore();
    store.setReason("False positive");

    store.finishBulkIgnore();

    expect(store.selectedIds.size).toBe(0);
    expect(store.ignoringId).toBeNull();
    expect(store.reason).toBe("");
  });
});
