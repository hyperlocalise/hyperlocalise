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
import { describe, expect, it, vi } from "vite-plus/test";

import {
  buildCanvaPullEntries,
  buildCanvaSourceLocaleStatus,
  canvaApprovalPercent,
  canvaSourceIngestIsSettled,
  isCanvaIntegrationJob,
  latestPublishedCanvaCollectBatchId,
  mergeCanvaPullTranslations,
  publicJobOutputFiles,
  readCanvaConnectionIdFromJobInput,
  resolveCanvaJobLocales,
  waitForCanvaSourceIngest,
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
        sourceByPage: new Map([[0, { "canva.t.abcdef0123456789": "Hello" }]]),
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
          needsReupload: false,
        },
      ],
    });
  });

  it("marks positional source files as needing a re-upload", () => {
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
    ).toMatchObject({
      status: "idle",
      canAdd: false,
      pages: [{ needsReupload: true, status: "idle", translated: 0 }],
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

describe("buildCanvaPullEntries", () => {
  it("uses the source text as the target for the source locale", () => {
    expect(
      buildCanvaPullEntries({
        sourceFile: { "canva.t.hello": "Hello", "canva.segment.0.0": "Legacy" },
        localeIsSource: true,
        editorTranslations: {},
        knownTextsByKey: new Map([["canva.t.hello", ["Hola"]]]),
      }),
    ).toEqual([
      {
        key: "canva.t.hello",
        source: "Hello",
        target: "Hello",
        knownTexts: ["Hola"],
      },
    ]);
  });

  it("uses editor text for a target locale and null when missing", () => {
    expect(
      buildCanvaPullEntries({
        sourceFile: { "canva.t.hello": "Hello", "canva.t.world": "World" },
        localeIsSource: false,
        editorTranslations: { "canva.t.hello": "Hola" },
        knownTextsByKey: new Map([
          ["canva.t.hello", ["Hola", "Bonjour"]],
          ["canva.t.world", []],
        ]),
      }),
    ).toEqual([
      {
        key: "canva.t.hello",
        source: "Hello",
        target: "Hola",
        knownTexts: ["Hola", "Bonjour"],
      },
      {
        key: "canva.t.world",
        source: "World",
        target: null,
        knownTexts: [],
      },
    ]);
  });

  it("fills missing editor rows from job output and keeps editor edits", () => {
    const merged = mergeCanvaPullTranslations(
      { "canva.t.hello": "Hola (editor)" },
      { "canva.t.hello": "Hola (job)", "canva.t.world": "Mundo" },
    );
    expect(merged).toEqual({
      "canva.t.hello": "Hola (editor)",
      "canva.t.world": "Mundo",
    });
    expect(
      buildCanvaPullEntries({
        sourceFile: { "canva.t.hello": "Hello", "canva.t.world": "World" },
        localeIsSource: false,
        editorTranslations: merged,
        knownTextsByKey: new Map(),
      }),
    ).toEqual([
      {
        key: "canva.t.hello",
        source: "Hello",
        target: "Hola (editor)",
        knownTexts: [],
      },
      {
        key: "canva.t.world",
        source: "World",
        target: "Mundo",
        knownTexts: [],
      },
    ]);
  });

  it("returns job output when editor rows are empty after a succeeded job", () => {
    expect(
      buildCanvaPullEntries({
        sourceFile: { "canva.t.hello": "Hello" },
        localeIsSource: false,
        editorTranslations: mergeCanvaPullTranslations({}, { "canva.t.hello": "Hola" }),
        knownTextsByKey: new Map(),
      }),
    ).toEqual([
      {
        key: "canva.t.hello",
        source: "Hello",
        target: "Hola",
        knownTexts: [],
      },
    ]);
  });
});

describe("waitForCanvaSourceIngest", () => {
  it("treats ingested, skipped, and failed as settled", () => {
    expect(canvaSourceIngestIsSettled("ingested")).toBe(true);
    expect(canvaSourceIngestIsSettled("skipped")).toBe(true);
    expect(canvaSourceIngestIsSettled("failed")).toBe(true);
    expect(canvaSourceIngestIsSettled("pending")).toBe(false);
    expect(canvaSourceIngestIsSettled("ingesting")).toBe(false);
    expect(canvaSourceIngestIsSettled(null)).toBe(false);
  });

  it("returns immediately when every collected page has ingested", async () => {
    const loadStates = vi.fn(async () => ["ingested"]);
    await expect(
      waitForCanvaSourceIngest({
        organizationId: "org_1",
        projectId: "project_1",
        sourcePaths: ["canva/designs/mic/page-1.json"],
        loadStates,
      }),
    ).resolves.toBe(true);
    expect(loadStates).toHaveBeenCalledTimes(1);
  });

  it("waits until ingest settles before generate can start jobs", async () => {
    const loadStates = vi
      .fn()
      .mockResolvedValueOnce(["pending"])
      .mockResolvedValueOnce(["ingesting"])
      .mockResolvedValueOnce(["ingested"]);
    let now = 0;
    await expect(
      waitForCanvaSourceIngest({
        organizationId: "org_1",
        projectId: "project_1",
        sourcePaths: ["canva/designs/mic/page-1.json"],
        timeoutMs: 5_000,
        intervalMs: 10,
        now: () => now,
        sleep: async (ms) => {
          now += ms;
        },
        loadStates,
      }),
    ).resolves.toBe(true);
    expect(loadStates).toHaveBeenCalledTimes(3);
  });

  it("times out and still lets jobs start when ingest is delayed", async () => {
    await expect(
      waitForCanvaSourceIngest({
        organizationId: "org_1",
        projectId: "project_1",
        sourcePaths: ["canva/designs/mic/page-1.json"],
        timeoutMs: 20,
        intervalMs: 10,
        now: (() => {
          let value = 0;
          return () => {
            const current = value;
            value += 10;
            return current;
          };
        })(),
        sleep: async () => {},
        loadStates: async () => ["pending"],
      }),
    ).resolves.toBe(false);
  });
});
