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
  allSelectedPushRowsHaveEligibleLocales,
  contentEditorPushDialogCandidates,
  contentEditorToolbarShowsIntegration,
  nextPushDialogSelection,
  selectActionablePushCandidates,
  selectedPushRowsHaveEligibleLocales,
} from "./content-editor-integration-toolbar-visibility";

describe("contentEditorToolbarShowsIntegration", () => {
  it("is false when there are no candidates", () => {
    expect(contentEditorToolbarShowsIntegration(undefined)).toBe(false);
    expect(contentEditorToolbarShowsIntegration([])).toBe(false);
  });

  it("is true when at least one candidate exists", () => {
    expect(contentEditorToolbarShowsIntegration([{ automationId: "a1" }])).toBe(true);
  });
});

describe("selectActionablePushCandidates", () => {
  it("drops candidates with a push run in progress", () => {
    expect(
      selectActionablePushCandidates([
        { automationId: "a1", pushRunInProgress: false },
        { automationId: "a2", pushRunInProgress: true },
      ]),
    ).toEqual([{ automationId: "a1", pushRunInProgress: false }]);
  });
});

describe("nextPushDialogSelection", () => {
  it("keeps the current selection after a refresh", () => {
    expect(
      nextPushDialogSelection(
        ["google-drive/b.docx"],
        ["google-drive/a.docx", "google-drive/b.docx"],
      ),
    ).toEqual(["google-drive/b.docx"]);
  });

  it("drops paths that disappeared after a refresh", () => {
    expect(
      nextPushDialogSelection(
        ["google-drive/b.docx", "google-drive/gone.docx"],
        ["google-drive/a.docx", "google-drive/b.docx"],
      ),
    ).toEqual(["google-drive/b.docx"]);
  });
});

describe("allSelectedPushRowsHaveEligibleLocales", () => {
  const rows = [
    { sourcePath: "google-drive/a.docx", eligibleLocaleCount: 0 },
    { sourcePath: "google-drive/b.docx", eligibleLocaleCount: 2 },
  ];

  it("is false when any selected row is not ready", () => {
    expect(allSelectedPushRowsHaveEligibleLocales(rows, ["google-drive/a.docx"])).toBe(false);
    expect(
      allSelectedPushRowsHaveEligibleLocales(rows, ["google-drive/a.docx", "google-drive/b.docx"]),
    ).toBe(false);
  });

  it("is true when every selected row is ready", () => {
    expect(allSelectedPushRowsHaveEligibleLocales(rows, ["google-drive/b.docx"])).toBe(true);
  });
});

describe("contentEditorPushDialogCandidates", () => {
  it("falls back to ingest candidates when the push query failed", () => {
    expect(
      contentEditorPushDialogCandidates({
        ingestCandidates: [{ automationId: "a1", name: "Drive" }],
        pushCandidates: undefined,
        pushQueryFailed: true,
      }),
    ).toEqual([
      {
        automationId: "a1",
        name: "Drive",
        eligibleLocaleCount: 0,
        pushRunInProgress: false,
      },
    ]);
  });

  it("keeps actionable push candidates when the push query succeeded", () => {
    expect(
      contentEditorPushDialogCandidates({
        ingestCandidates: [{ automationId: "a1", name: "Drive" }],
        pushCandidates: [
          { automationId: "a1", name: "Drive", eligibleLocaleCount: 0, pushRunInProgress: true },
        ],
        pushQueryFailed: false,
      }),
    ).toEqual([]);
  });
});

describe("selectedPushRowsHaveEligibleLocales", () => {
  const rows = [
    { sourcePath: "google-drive/a.docx", eligibleLocaleCount: 0 },
    { sourcePath: "google-drive/b.docx", eligibleLocaleCount: 2 },
  ];

  it("is false when selection is empty or none are ready", () => {
    expect(selectedPushRowsHaveEligibleLocales(rows, [])).toBe(false);
    expect(selectedPushRowsHaveEligibleLocales(rows, ["google-drive/a.docx"])).toBe(false);
  });

  it("is true when at least one selected row has ready locales", () => {
    expect(selectedPushRowsHaveEligibleLocales(rows, ["google-drive/b.docx"])).toBe(true);
  });
});
