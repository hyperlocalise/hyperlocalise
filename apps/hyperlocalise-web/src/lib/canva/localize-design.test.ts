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
  isCanvaIntegrationJob,
  publicJobOutputFiles,
  readCanvaConnectionIdFromJobInput,
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
  it("detects canva-app metadata only on nested fileInput", () => {
    expect(
      isCanvaIntegrationJob({
        fileInput: { metadata: { integration: "canva-app" } },
      }),
    ).toBe(true);
    // Unlike Figma, top-level metadata alone is not treated as Canva.
    expect(
      isCanvaIntegrationJob({
        metadata: { integration: "canva-app" },
      }),
    ).toBe(false);
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
    ).toBeNull();
  });
});
