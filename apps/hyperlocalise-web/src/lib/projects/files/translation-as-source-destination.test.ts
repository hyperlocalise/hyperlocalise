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
import "dotenv/config";

import { describe, expect, it } from "vite-plus/test";

import {
  translationAsSourceDestinationPath,
  translationAsSourceDestinationRefusal,
  type TranslationAsSourceDestinationFile,
} from "./translation-as-source-destination";

describe("translationAsSourceDestinationPath", () => {
  it("keeps Word and Excel paths, including capital letters in the extension", () => {
    expect(translationAsSourceDestinationPath("requests/report.docx")).toBe("requests/report.docx");
    expect(translationAsSourceDestinationPath("prices.XLSX")).toBe("prices.XLSX");
  });

  it("sends an old .xls file as .xlsx so the destination reads a current workbook", () => {
    expect(translationAsSourceDestinationPath("legacy/budget.xls")).toBe("legacy/budget.xlsx");
    expect(translationAsSourceDestinationPath("legacy/budget.XLS")).toBe("legacy/budget.xlsx");
  });
});

describe("translationAsSourceDestinationRefusal", () => {
  const versionId = "11111111-1111-4111-8111-111111111111";
  const otherVersionId = "22222222-2222-4222-8222-222222222222";
  const addedAt = new Date("2026-11-01T00:00:00.000Z");

  it("lets a send replace an empty path or this file's last send without asking", () => {
    expect(translationAsSourceDestinationRefusal({ state: "empty" }, undefined)).toBeNull();
    expect(
      translationAsSourceDestinationRefusal({ state: "sent_from_here", versionId }, undefined),
    ).toBeNull();
  });

  it("asks before replacing a file from repository sync or from elsewhere", () => {
    const fromSync: TranslationAsSourceDestinationFile = {
      state: "from_sync",
      versionId,
      addedAt,
    };
    const other: TranslationAsSourceDestinationFile = {
      state: "other",
      versionId,
      addedAt,
      addedBy: "Ada",
      sentFrom: null,
    };

    expect(translationAsSourceDestinationRefusal(fromSync, undefined)).toEqual({
      code: "destination_file_replaced",
    });
    expect(translationAsSourceDestinationRefusal(other, undefined)).toEqual({
      code: "destination_file_replaced",
    });
    expect(translationAsSourceDestinationRefusal(fromSync, versionId)).toBeNull();
    expect(translationAsSourceDestinationRefusal(other, versionId)).toBeNull();
  });

  it("does not replace a file that arrived after the version the person confirmed", () => {
    const file: TranslationAsSourceDestinationFile = {
      state: "other",
      versionId,
      addedAt,
      addedBy: null,
      sentFrom: { projectId: "project_other", sourcePath: "requests/report.docx" },
    };

    expect(translationAsSourceDestinationRefusal(file, otherVersionId)).toEqual({
      code: "destination_file_replaced",
    });
  });
});
