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

import { createDefaultConfig } from "../catalog/node-catalog";
import { NODE_CONTRACTS } from "../catalog/node-contracts";
import { VISUAL_NODE_DESCRIPTIONS } from "../catalog/node-descriptions";
import { visualNodeConfigSchema, visualWorkflowV3DefinitionSchema } from "./definition-schema";
import { fromVisualWorkflowV3Definition, toVisualWorkflowV3Definition } from "./serializers";

describe("file node configuration", () => {
  it("provides bounded defaults for read, write, and convert", () => {
    expect(createDefaultConfig("action.file_read")).toEqual({
      kind: "action.file_read",
      fileId: "",
      encoding: "utf-8",
    });
    expect(createDefaultConfig("action.file_write")).toEqual({
      kind: "action.file_write",
      content: "",
      filename: "output.json",
      contentType: "application/json",
      encoding: "utf-8",
      locale: "",
      sourceFileId: "",
    });
    expect(createDefaultConfig("action.file_convert")).toEqual({
      kind: "action.file_convert",
      fileId: "",
      targetFormat: "json",
      filename: "",
      locale: "",
    });
  });

  it("accepts supported encodings and formats and rejects arbitrary values", () => {
    expect(
      visualNodeConfigSchema.safeParse({
        kind: "action.file_read",
        fileId: "file_source",
        encoding: "base64",
      }).success,
    ).toBe(true);
    expect(
      visualNodeConfigSchema.safeParse({
        kind: "action.file_convert",
        fileId: "file_source",
        targetFormat: "xliff",
      }).success,
    ).toBe(false);
    expect(
      visualNodeConfigSchema.safeParse({
        kind: "action.file_write",
        content: "hello",
        filename: "message.txt",
        contentType: "text/plain",
        encoding: "utf-16",
      }).success,
    ).toBe(false);
  });

  it("registers descriptions and typed file metadata ports", () => {
    expect(VISUAL_NODE_DESCRIPTIONS["action.file_read"].title).toBe("Read file");
    expect(VISUAL_NODE_DESCRIPTIONS["action.file_write"].title).toBe("Write file");
    expect(VISUAL_NODE_DESCRIPTIONS["action.file_convert"].title).toBe("Convert file");

    expect(NODE_CONTRACTS["action.file_read"].inputs).toEqual([
      { name: "fileId", type: "string", required: true },
      { name: "encoding", type: "string", required: true },
    ]);
    expect(NODE_CONTRACTS["action.file_write"].outputs).toContainEqual({
      path: "sourceFileId",
      type: "string",
      optional: true,
    });
    expect(NODE_CONTRACTS["action.file_convert"].outputs).toContainEqual({
      path: "targetFormat",
      type: "string",
      optional: true,
    });
    for (const type of ["action.file_read", "action.file_write", "action.file_convert"] as const) {
      expect(NODE_CONTRACTS[type].outputs).toContainEqual({
        path: "error",
        type: "object",
        optional: true,
      });
      expect(NODE_CONTRACTS[type].outputs.every((field) => field.optional)).toBe(true);
    }
  });

  it("round-trips file operation configs", () => {
    const original = {
      schemaVersion: 3 as const,
      name: "File operations",
      nodes: [
        {
          id: "read",
          type: "action.file_read" as const,
          config: {
            kind: "action.file_read" as const,
            fileId: "file_source",
            encoding: "utf-8" as const,
          },
        },
        {
          id: "write",
          type: "action.file_write" as const,
          config: {
            kind: "action.file_write" as const,
            content: "hello",
            filename: "message.txt",
            contentType: "text/plain",
            encoding: "utf-8" as const,
            locale: "fr",
            sourceFileId: "file_source",
          },
        },
        {
          id: "convert",
          type: "action.file_convert" as const,
          config: {
            kind: "action.file_convert" as const,
            fileId: "file_source",
            targetFormat: "yaml" as const,
            filename: "messages.yaml",
            locale: "fr",
          },
        },
      ],
      edges: [],
      editor: {
        positions: {
          read: { x: 0, y: 0 },
          write: { x: 320, y: 0 },
          convert: { x: 640, y: 0 },
        },
      },
    };

    const parsed = visualWorkflowV3DefinitionSchema.parse(original);
    expect(toVisualWorkflowV3Definition(fromVisualWorkflowV3Definition(parsed))).toEqual(original);
  });
});
