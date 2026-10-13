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
  buildCanvaSourceLocaleStatus,
  canvaApprovalPercent,
  isCanvaIntegrationJob,
  latestPublishedCanvaCollectBatchId,
  mergeEditorTranslationsOverOutputFile,
  publicJobOutputFiles,
  readCanvaConnectionIdFromJobInput,
  resolveCanvaJobLocales,
} from "./localize-design";

describe("publicJobOutputFiles", () => {
  it("returns null for non file_result outcomes", () => {
    expect(
      publicJobOutputFiles({
        type: "file",
        outcomeKind: "error",
        outcomePayload: { outputFiles: [] },
      }),
    ).toBeNull();
    expect(
      publicJobOutputFiles({
        type: "batch",
        outcomeKind: "file_result",
        outcomePayload: { outputFiles: [] },
      }),
    ).toBeNull();
  });

  it("returns null when outputFiles is missing or malformed", () => {
    expect(
      publicJobOutputFiles({
        type: "file",
        outcomeKind: "file_result",
        outcomePayload: null,
      }),
    ).toBeNull();
    expect(
      publicJobOutputFiles({
        type: "file",
        outcomeKind: "file_result",
        outcomePayload: { outputFiles: "nope" },
      }),
    ).toBeNull();
    expect(
      publicJobOutputFiles({
        type: "file",
        outcomeKind: "file_result",
        outcomePayload: {
          outputFiles: [{ fileId: "f1", locale: "es", filename: "" }],
        },
      }),
    ).toBeNull();
    expect(
      publicJobOutputFiles({
        type: "file",
        outcomeKind: "file_result",
        outcomePayload: {
          outputFiles: [{ fileId: "f1", locale: "es" }],
        },
      }),
    ).toBeNull();
  });

  it("parses valid output file entries", () => {
    expect(
      publicJobOutputFiles({
        type: "file",
        outcomeKind: "file_result",
        outcomePayload: {
          outputFiles: [
            { fileId: "file_1", locale: "es", filename: "design.es.json" },
            { fileId: "file_2", locale: "fr", filename: "design.fr.json" },
          ],
        },
      }),
    ).toEqual([
      { fileId: "file_1", locale: "es", filename: "design.es.json" },
      { fileId: "file_2", locale: "fr", filename: "design.fr.json" },
    ]);
  });
});

describe("isCanvaIntegrationJob", () => {
  it("detects canva-app metadata on nested fileInput or top-level metadata", () => {
    expect(
      isCanvaIntegrationJob({
        fileInput: { metadata: { integration: "canva-app" } },
      }),
    ).toBe(true);
    expect(
      isCanvaIntegrationJob({
        metadata: { integration: "canva-app" },
      }),
    ).toBe(true);
  });

  it("rejects non-canva jobs and empty metadata", () => {
    expect(isCanvaIntegrationJob(null)).toBe(false);
    expect(isCanvaIntegrationJob({})).toBe(false);
    expect(
      isCanvaIntegrationJob({
        fileInput: { metadata: { integration: "figma-plugin" } },
      }),
    ).toBe(false);
    expect(
      isCanvaIntegrationJob({
        fileInput: { metadata: { integration: "" } },
      }),
    ).toBe(false);
  });
});

describe("readCanvaConnectionIdFromJobInput", () => {
  it("reads a non-empty connection id from nested metadata", () => {
    expect(
      readCanvaConnectionIdFromJobInput({
        fileInput: { metadata: { canvaConnectionId: "conn_123" } },
      }),
    ).toBe("conn_123");
  });

  it("returns null when connection id is missing or blank", () => {
    expect(readCanvaConnectionIdFromJobInput(null)).toBeNull();
    expect(readCanvaConnectionIdFromJobInput({})).toBeNull();
    expect(
      readCanvaConnectionIdFromJobInput({
        fileInput: { metadata: { canvaConnectionId: "" } },
      }),
    ).toBeNull();
    expect(
      readCanvaConnectionIdFromJobInput({
        metadata: { canvaConnectionId: "conn_top" },
      }),
    ).toBe("conn_top");
  });
});

describe("resolveCanvaJobLocales", () => {
  it("uses the project source and all project targets when none are requested", () => {
    expect(
      resolveCanvaJobLocales({
        project: { sourceLocale: "en-US", targetLocales: ["fr-FR", "de-DE"] },
      }),
    ).toEqual({
      sourceLocale: "en-US",
      targetLocales: ["fr-FR", "de-DE"],
    });
  });

  it("keeps a requested subset of project targets", () => {
    expect(
      resolveCanvaJobLocales({
        project: { sourceLocale: "en-US", targetLocales: ["fr-FR", "de-DE"] },
        requestedTargetLocales: ["de-DE"],
      }),
    ).toEqual({
      sourceLocale: "en-US",
      targetLocales: ["de-DE"],
    });
  });

  it("ignores a missing project source until validation", () => {
    expect(() =>
      resolveCanvaJobLocales({
        project: { sourceLocale: null, targetLocales: ["fr-FR"] },
      }),
    ).toThrow("job_source_locale_not_in_project");
  });
});

describe("latestPublishedCanvaCollectBatchId", () => {
  it("skips newer incomplete batches so a failed collect cannot hide the last complete one", () => {
    expect(
      latestPublishedCanvaCollectBatchId([
        {
          metadata: {
            canvaCollectBatchId: "partial",
          },
        },
        {
          metadata: {
            canvaCollectBatchId: "complete",
            canvaCollectBatchComplete: true,
          },
        },
      ]),
    ).toBe("complete");
  });

  it("returns null when no collect batch has been published", () => {
    expect(
      latestPublishedCanvaCollectBatchId([
        {
          metadata: {
            canvaCollectBatchId: "partial",
          },
        },
      ]),
    ).toBeNull();
  });
});

describe("canvaApprovalPercent", () => {
  it("rounds approved segments against the collected total", () => {
    expect(canvaApprovalPercent(0, 0)).toBe(0);
    expect(canvaApprovalPercent(1, 4)).toBe(25);
    expect(canvaApprovalPercent(4, 4)).toBe(100);
  });
});

describe("buildCanvaSourceLocaleStatus", () => {
  it("marks collected source pages as ready to apply", () => {
    expect(
      buildCanvaSourceLocaleStatus({
        locale: "en-US",
        sourceLocale: "en-US",
        pages: [
          {
            pageIndex: 0,
            sourcePath: "canva/designs/mic/page-1.json",
            sourceFileId: "file_1",
            segmentCount: 3,
            wordCount: 12,
          },
        ],
        sourceByPage: new Map([[0, { "canva.segment.0.0": "Hello" }]]),
      }),
    ).toEqual({
      locale: "en-US",
      isSource: true,
      status: "succeeded",
      translated: 3,
      total: 3,
      translatedWords: 12,
      wordCount: 12,
      percent: 100,
      approved: 3,
      approvedPercent: 100,
      canAdd: true,
      pages: [
        {
          pageIndex: 0,
          sourcePath: "canva/designs/mic/page-1.json",
          jobId: null,
          status: "succeeded",
          translated: 3,
          total: 3,
          translatedWords: 12,
          wordCount: 12,
          approved: 3,
        },
      ],
    });
  });

  it("stays idle when nothing has been collected", () => {
    expect(
      buildCanvaSourceLocaleStatus({
        locale: "en-US",
        sourceLocale: "en-US",
        pages: [],
        sourceByPage: new Map(),
      }),
    ).toMatchObject({
      isSource: true,
      status: "idle",
      canAdd: false,
      percent: 0,
    });
  });
});

describe("mergeEditorTranslationsOverOutputFile", () => {
  it("prefers content editor values over stale job output keys", () => {
    expect(
      mergeEditorTranslationsOverOutputFile(
        {
          "canva.segment.0.0": "Thực đơn",
          "canva.segment.1.0.0": "Thực đơn",
        },
        {
          "canva.segment.0.0": "menu",
        },
      ),
    ).toEqual({
      "canva.segment.0.0": "menu",
      "canva.segment.1.0.0": "Thực đơn",
    });
  });

  it("ignores blank editor values", () => {
    expect(
      mergeEditorTranslationsOverOutputFile(
        { "canva.segment.0.0": "Thực đơn" },
        { "canva.segment.0.0": "   " },
      ),
    ).toEqual({
      "canva.segment.0.0": "Thực đơn",
    });
  });
});
