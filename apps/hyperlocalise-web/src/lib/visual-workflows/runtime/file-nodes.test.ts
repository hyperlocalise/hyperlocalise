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

import type { CanonicalVisualWorkflowEdge } from "../schema/types";
import { executeVisualWorkflowNode } from "./execute-node";
import {
  executeFileConvertNode,
  executeFileReadNode,
  executeFileWriteNode,
  type FileConvertDependencies,
  type FileReadDependencies,
  type FileWriteDependencies,
  VISUAL_WORKFLOW_FILE_MAX_BYTES,
} from "./file-nodes";
import { selectNextEdges } from "./graph-index";

const organizationId = "00000000-0000-4000-8000-000000000001";
const visualWorkflowId = "00000000-0000-4000-8000-000000000002";

type FileScope = { organizationId: string; projectId?: string | null; fileId: string };

function body(content: Uint8Array | string) {
  const bytes = typeof content === "string" ? Buffer.from(content) : content;
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

function dependencies(input: {
  content?: Uint8Array | string;
  byteSize?: number;
  metadata?: Record<string, unknown>;
  missingFile?: boolean;
  missingObject?: boolean;
  actorProjectId?: string | null;
  missingActor?: boolean;
  onFind?: (scope: FileScope) => void;
}): FileReadDependencies {
  return {
    async resolveActor() {
      if (input.missingActor) return null;
      return { userId: "user-1", projectId: input.actorProjectId ?? null };
    },
    async findFile(scope: FileScope) {
      input.onFind?.(scope);
      if (input.missingFile) return null;
      return {
        id: scope.fileId,
        storageKey: "organizations/private/source.json",
        filename: "source.json",
        contentType: "application/json",
        byteSize: input.byteSize ?? Buffer.byteLength(input.content ?? "{}"),
        sha256: "source-sha256",
        metadata: input.metadata ?? {},
      };
    },
    async getObject() {
      if (input.missingObject) return null;
      return {
        body: body(input.content ?? "{}"),
        contentType: "application/json",
        etag: null,
      };
    },
  };
}

describe("File Read workflow node", () => {
  it("reads UTF-8 content and safe metadata in organization scope", async () => {
    let requestedScope: FileScope | undefined;
    const result = await executeFileReadNode({
      organizationId,
      visualWorkflowId,
      fileId: "file_source",
      encoding: "utf-8",
      dependencies: dependencies({
        content: '{"greeting":"Hello"}',
        metadata: { locale: "en-AU", format: "json" },
        onFind: (scope) => {
          requestedScope = scope;
        },
      }),
    });

    expect(requestedScope).toEqual({ organizationId, projectId: null, fileId: "file_source" });
    expect(result).toEqual({
      ok: true,
      switchCase: "success",
      output: {
        fileId: "file_source",
        content: '{"greeting":"Hello"}',
        filename: "source.json",
        contentType: "application/json",
        byteSize: 20,
        sha256: "source-sha256",
        encoding: "utf-8",
        locale: "en-AU",
        metadata: { locale: "en-AU", format: "json" },
      },
    });
  });

  it("returns base64 without interpreting binary content", async () => {
    const content = Uint8Array.from([0, 255, 42]);
    const result = await executeFileReadNode({
      organizationId,
      visualWorkflowId,
      fileId: "file_binary",
      encoding: "base64",
      dependencies: dependencies({ content }),
    });

    expect(result).toMatchObject({
      ok: true,
      switchCase: "success",
      output: { content: Buffer.from(content).toString("base64"), byteSize: 3 },
    });
  });

  it.each([
    ["/etc/passwd", "invalid_file_reference"],
    ["https://example.com/private", "invalid_file_reference"],
  ])("rejects arbitrary host or remote reference %s", async (fileId, code) => {
    await expect(
      executeFileReadNode({
        organizationId,
        visualWorkflowId,
        fileId,
        encoding: "utf-8",
        dependencies: dependencies({}),
      }),
    ).resolves.toMatchObject({ ok: true, switchCase: "error", output: { error: { code } } });
  });

  it("returns a scoped not-found error without exposing the identifier", async () => {
    const result = await executeFileReadNode({
      organizationId,
      visualWorkflowId,
      fileId: "file_private_name",
      encoding: "utf-8",
      dependencies: dependencies({ missingFile: true }),
    });

    expect(result).toMatchObject({
      ok: true,
      switchCase: "error",
      output: { error: { code: "stored_file_not_found" } },
    });
    expect(JSON.stringify(result)).not.toContain("file_private_name");
  });

  it("distinguishes missing object content from a missing file row", async () => {
    await expect(
      executeFileReadNode({
        organizationId,
        visualWorkflowId,
        fileId: "file_source",
        encoding: "utf-8",
        dependencies: dependencies({ missingObject: true }),
      }),
    ).resolves.toMatchObject({
      ok: true,
      switchCase: "error",
      output: { error: { code: "stored_file_content_missing" } },
    });
  });

  it("rejects declared and streamed content above the byte limit", async () => {
    await expect(
      executeFileReadNode({
        organizationId,
        visualWorkflowId,
        fileId: "file_large",
        encoding: "utf-8",
        dependencies: dependencies({ byteSize: VISUAL_WORKFLOW_FILE_MAX_BYTES + 1 }),
      }),
    ).resolves.toMatchObject({ output: { error: { code: "file_too_large" } } });

    await expect(
      executeFileReadNode({
        organizationId,
        visualWorkflowId,
        fileId: "file_large",
        encoding: "utf-8",
        dependencies: dependencies({
          content: new Uint8Array(VISUAL_WORKFLOW_FILE_MAX_BYTES + 1),
          byteSize: 1,
        }),
      }),
    ).resolves.toMatchObject({ output: { error: { code: "file_too_large" } } });
  });

  it("rejects invalid UTF-8 and observes cancellation", async () => {
    await expect(
      executeFileReadNode({
        organizationId,
        visualWorkflowId,
        fileId: "file_binary",
        encoding: "utf-8",
        dependencies: dependencies({ content: Uint8Array.from([0xff]) }),
      }),
    ).resolves.toMatchObject({ output: { error: { code: "unsupported_file_encoding" } } });

    const controller = new AbortController();
    controller.abort();
    await expect(
      executeFileReadNode({
        organizationId,
        visualWorkflowId,
        fileId: "file_source",
        encoding: "utf-8",
        signal: controller.signal,
        dependencies: dependencies({}),
      }),
    ).resolves.toMatchObject({ output: { error: { code: "cancelled" } } });
  });

  it("reads within the workflow project and requires a current actor", async () => {
    let requestedScope: FileScope | undefined;
    await executeFileReadNode({
      organizationId,
      visualWorkflowId,
      fileId: "file_source",
      encoding: "utf-8",
      dependencies: dependencies({
        actorProjectId: "project-1",
        onFind: (scope) => {
          requestedScope = scope;
        },
      }),
    });
    expect(requestedScope).toEqual({
      organizationId,
      projectId: "project-1",
      fileId: "file_source",
    });

    await expect(
      executeFileReadNode({
        organizationId,
        visualWorkflowId,
        fileId: "file_source",
        encoding: "utf-8",
        dependencies: dependencies({ missingActor: true }),
      }),
    ).resolves.toMatchObject({ output: { error: { code: "file_actor_required" } } });

    await expect(
      executeFileReadNode({
        organizationId,
        fileId: "file_source",
        encoding: "utf-8",
        dependencies: dependencies({}),
      }),
    ).resolves.toMatchObject({ output: { error: { code: "file_actor_required" } } });
  });

  it("is wired into the production executor", async () => {
    const result = await executeVisualWorkflowNode({
      node: {
        id: "read",
        type: "action.file_read",
        config: { kind: "action.file_read", fileId: "invalid", encoding: "utf-8" },
      },
      context: { trigger: {}, nodes: {} },
      organizationId,
      inputsResolved: true,
    });

    expect(result).toMatchObject({
      ok: true,
      switchCase: "error",
      output: { error: { code: "invalid_file_reference" } },
    });
  });

  it("routes file nodes only through the selected branch", () => {
    const outgoing: CanonicalVisualWorkflowEdge[] = ["success", "error"].map((sourceHandle) => ({
      id: `edge-${sourceHandle}`,
      source: "file",
      target: `after-${sourceHandle}`,
      sourceHandle,
      targetHandle: null,
    }));

    expect(
      selectNextEdges({
        nodeType: "action.file_read",
        branchResult: null,
        switchCase: "error",
        useErrorBranch: false,
        outgoing,
      }).map((edge) => edge.sourceHandle),
    ).toEqual(["error"]);
  });
});

function writeInput(overrides: Partial<Parameters<typeof executeFileWriteNode>[0]> = {}) {
  return {
    organizationId,
    visualWorkflowId: "00000000-0000-4000-8000-000000000002",
    visualWorkflowRunId: "00000000-0000-4000-8000-000000000003",
    nodeId: "write-file",
    idempotencyKey: "run:write-file:attempt-1",
    content: '{"hello":"world"}',
    filename: "messages.json",
    contentType: "application/json",
    encoding: "utf-8" as const,
    ...overrides,
  };
}

function writeDependencies(): {
  dependencies: FileWriteDependencies;
  files: Map<string, Awaited<ReturnType<FileWriteDependencies["createFile"]>>>;
  creates: Array<Parameters<FileWriteDependencies["createFile"]>[0]>;
} {
  const files = new Map<string, Awaited<ReturnType<FileWriteDependencies["createFile"]>>>();
  const creates: Array<Parameters<FileWriteDependencies["createFile"]>[0]> = [];
  return {
    files,
    creates,
    dependencies: {
      async resolveActor() {
        return { userId: "user-1", projectId: "project-1" };
      },
      async findFile({ fileId }) {
        return files.get(fileId) ?? null;
      },
      async createFile(input) {
        creates.push(input);
        const file = {
          id: input.id,
          filename: input.filename,
          contentType: input.contentType,
          byteSize: input.content.byteLength,
          sha256: await crypto.subtle
            .digest(
              "SHA-256",
              input.content.buffer.slice(
                input.content.byteOffset,
                input.content.byteOffset + input.content.byteLength,
              ) as ArrayBuffer,
            )
            .then((hash) => Buffer.from(hash).toString("hex")),
          metadata: input.metadata,
        };
        files.set(file.id, file);
        return file;
      },
    },
  };
}

describe("File Write workflow node", () => {
  it("writes with an authorized actor and preserves provenance", async () => {
    const state = writeDependencies();
    state.files.set("file_source", {
      id: "file_source",
      filename: "source.json",
      contentType: "application/json",
      byteSize: 2,
      sha256: "source-sha",
      metadata: {},
    });

    const result = await executeFileWriteNode(
      writeInput({
        locale: "en-au",
        sourceFileId: "file_source",
        dependencies: state.dependencies,
      }),
    );

    expect(result).toMatchObject({
      ok: true,
      switchCase: "success",
      output: {
        filename: "messages.json",
        contentType: "application/json",
        locale: "en-AU",
        sourceFileId: "file_source",
      },
    });
    expect(state.creates).toHaveLength(1);
    expect(state.creates[0]).toMatchObject({
      organizationId,
      projectId: "project-1",
      createdByUserId: "user-1",
      metadata: {
        operation: "workflow_file_write",
        sourceFileId: "file_source",
        sourceSha256: "source-sha",
        nodeId: "write-file",
      },
    });
  });

  it("reuses the stored file for a replay with the same payload", async () => {
    const state = writeDependencies();
    const input = writeInput({ dependencies: state.dependencies });
    const first = await executeFileWriteNode(input);
    const replay = await executeFileWriteNode(input);

    expect(state.creates).toHaveLength(1);
    expect(replay).toEqual(first);
  });

  it("returns the winning file when a concurrent attempt creates it first", async () => {
    const { dependencies } = writeDependencies();
    const losingAttempt: FileWriteDependencies = {
      ...dependencies,
      createFile: async (createInput) => {
        await dependencies.createFile(createInput);
        throw new Error("duplicate key value violates unique constraint");
      },
    };

    await expect(
      executeFileWriteNode(writeInput({ dependencies: losingAttempt })),
    ).resolves.toMatchObject({ switchCase: "success", output: { filename: "messages.json" } });
    await expect(
      executeFileWriteNode(
        writeInput({
          idempotencyKey: "run:write-file:attempt-2",
          dependencies: {
            ...dependencies,
            createFile: async () => {
              throw new Error("storage unavailable");
            },
          },
        }),
      ),
    ).resolves.toMatchObject({ output: { error: { code: "file_write_failed" } } });
  });

  it("rejects a changed payload for the same retry key", async () => {
    const state = writeDependencies();
    await executeFileWriteNode(writeInput({ dependencies: state.dependencies }));

    await expect(
      executeFileWriteNode(writeInput({ content: "changed", dependencies: state.dependencies })),
    ).resolves.toMatchObject({
      switchCase: "error",
      output: { error: { code: "file_idempotency_conflict" } },
    });
    expect(state.creates).toHaveLength(1);
  });

  it("requires a current actor and a source file in the same scope", async () => {
    const state = writeDependencies();
    state.dependencies.resolveActor = async () => null;
    await expect(
      executeFileWriteNode(writeInput({ dependencies: state.dependencies })),
    ).resolves.toMatchObject({ output: { error: { code: "file_actor_required" } } });

    state.dependencies.resolveActor = async () => ({ userId: "user-1", projectId: null });
    await expect(
      executeFileWriteNode(
        writeInput({ sourceFileId: "file_missing", dependencies: state.dependencies }),
      ),
    ).resolves.toMatchObject({ output: { error: { code: "stored_file_not_found" } } });
  });

  it("rejects host paths, malformed base64, and oversized content", async () => {
    const state = writeDependencies();
    await expect(
      executeFileWriteNode(writeInput({ filename: "../secret", dependencies: state.dependencies })),
    ).resolves.toMatchObject({ output: { error: { code: "invalid_file_name" } } });
    await expect(
      executeFileWriteNode(
        writeInput({ content: "not base64", encoding: "base64", dependencies: state.dependencies }),
      ),
    ).resolves.toMatchObject({ output: { error: { code: "invalid_base64_content" } } });
    await expect(
      executeFileWriteNode(
        writeInput({
          content: "x".repeat(VISUAL_WORKFLOW_FILE_MAX_BYTES + 1),
          dependencies: state.dependencies,
        }),
      ),
    ).resolves.toMatchObject({ output: { error: { code: "file_too_large" } } });
  });

  it("validates MIME types without pathological regular-expression backtracking", async () => {
    const state = writeDependencies();
    await expect(
      executeFileWriteNode(
        writeInput({
          contentType: `0/0;!=${":\t;!=".repeat(20_000)}`,
          dependencies: state.dependencies,
        }),
      ),
    ).resolves.toMatchObject({ output: { error: { code: "invalid_content_type" } } });
    await expect(
      executeFileWriteNode(
        writeInput({
          contentType: 'application/json; charset="utf-8"',
          dependencies: state.dependencies,
        }),
      ),
    ).resolves.toMatchObject({ switchCase: "success" });
  });

  it("is wired into the production executor", async () => {
    const result = await executeVisualWorkflowNode({
      node: {
        id: "write",
        type: "action.file_write",
        config: {
          kind: "action.file_write",
          content: "{}",
          filename: "output.json",
          contentType: "application/json",
          encoding: "utf-8",
        },
      },
      context: { trigger: {}, nodes: {} },
      organizationId,
      inputsResolved: true,
    });

    expect(result).toMatchObject({
      switchCase: "error",
      output: { error: { code: "file_actor_required" } },
    });
  });
});

async function testSha256(content: Buffer) {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    content.buffer.slice(
      content.byteOffset,
      content.byteOffset + content.byteLength,
    ) as ArrayBuffer,
  );
  return Buffer.from(hash).toString("hex");
}

function convertDependencies(input: {
  filename?: string;
  content?: string;
  metadata?: Record<string, unknown>;
}) {
  const objects = new Map<string, Buffer>();
  const files = new Map<
    string,
    {
      id: string;
      storageKey: string;
      filename: string;
      contentType: string;
      byteSize: number;
      sha256: string;
      metadata: Record<string, unknown>;
    }
  >();
  const creates: Array<Parameters<FileConvertDependencies["createFile"]>[0]> = [];
  const sourceContent = Buffer.from(input.content ?? '{"hello":"Hello"}');
  files.set("file_source", {
    id: "file_source",
    storageKey: "source-object",
    filename: input.filename ?? "messages.json",
    contentType: "application/json",
    byteSize: sourceContent.byteLength,
    sha256: "source-sha",
    metadata: input.metadata ?? {},
  });
  objects.set("source-object", sourceContent);

  const dependencies: FileConvertDependencies = {
    async resolveActor() {
      return { userId: "user-1", projectId: "project-1" };
    },
    async findFile({ fileId }) {
      return files.get(fileId) ?? null;
    },
    async getObject({ keyOrUrl }) {
      const content = objects.get(keyOrUrl);
      return content
        ? { body: body(content), contentType: "application/octet-stream", etag: null }
        : null;
    },
    async createFile(createInput) {
      creates.push(createInput);
      const storageKey = `derived-${createInput.id}`;
      const file = {
        id: createInput.id,
        storageKey,
        filename: createInput.filename,
        contentType: createInput.contentType,
        byteSize: createInput.content.byteLength,
        sha256: await testSha256(createInput.content),
        metadata: createInput.metadata,
      };
      files.set(file.id, file);
      objects.set(storageKey, createInput.content);
      return file;
    },
  };
  return { dependencies, creates, files, objects };
}

function convertInput(
  dependencies: FileConvertDependencies,
  overrides: Partial<Parameters<typeof executeFileConvertNode>[0]> = {},
) {
  return {
    organizationId,
    visualWorkflowId: "00000000-0000-4000-8000-000000000002",
    visualWorkflowRunId: "00000000-0000-4000-8000-000000000003",
    nodeId: "convert-file",
    idempotencyKey: "run:convert-file:attempt-1",
    fileId: "file_source",
    targetFormat: "yaml" as const,
    dependencies,
    ...overrides,
  };
}

describe("File Convert workflow node", () => {
  it("converts JSON to YAML and preserves source provenance and locale", async () => {
    const state = convertDependencies({
      content: '{"hello":"Hello","@hello":{"description":"Greeting"}}',
      metadata: { locale: "en-AU" },
    });
    const result = await executeFileConvertNode(convertInput(state.dependencies));

    expect(result).toMatchObject({
      switchCase: "success",
      output: {
        filename: "messages.yaml",
        contentType: "application/yaml",
        locale: "en-AU",
        sourceFileId: "file_source",
        sourceFormat: "json",
        targetFormat: "yaml",
      },
    });
    expect(state.creates).toHaveLength(1);
    expect(state.creates[0]?.content.toString()).toContain('"@hello":');
    expect(state.creates[0]?.metadata).toMatchObject({
      operation: "workflow_file_convert",
      sourceFileId: "file_source",
      sourceSha256: "source-sha",
      sourceFormat: "json",
      targetFormat: "yaml",
      locale: "en-AU",
    });
  });

  it("converts YAML to ARB without dropping nested entries", async () => {
    const state = convertDependencies({
      filename: "messages.yml",
      content: "home:\n  title: Home\n  subtitle: Welcome\n",
    });
    await executeFileConvertNode(
      convertInput(state.dependencies, { targetFormat: "arb", filename: "app.arb" }),
    );

    expect(JSON.parse(state.creates[0]?.content.toString() ?? "")).toEqual({
      home: { title: "Home", subtitle: "Welcome" },
    });
  });

  it("is idempotent when conversion is replayed", async () => {
    const state = convertDependencies({});
    const conversion = convertInput(state.dependencies);
    const first = await executeFileConvertNode(conversion);
    const replay = await executeFileConvertNode(conversion);

    expect(replay).toEqual(first);
    expect(state.creates).toHaveLength(1);
  });

  it("returns structured errors for unsupported and malformed formats", async () => {
    const unsupported = convertDependencies({ filename: "messages.po" });
    await expect(
      executeFileConvertNode(convertInput(unsupported.dependencies)),
    ).resolves.toMatchObject({ output: { error: { code: "unsupported_file_format" } } });

    const malformed = convertDependencies({ content: '{"hello":' });
    await expect(
      executeFileConvertNode(convertInput(malformed.dependencies)),
    ).resolves.toMatchObject({ output: { error: { code: "invalid_file_format" } } });

    const scalarToArb = convertDependencies({ filename: "messages.yaml", content: "Hello\n" });
    await expect(
      executeFileConvertNode(convertInput(scalarToArb.dependencies, { targetFormat: "arb" })),
    ).resolves.toMatchObject({ output: { error: { code: "unsupported_file_value" } } });
    expect(scalarToArb.creates).toHaveLength(0);
  });

  it("rejects unsafe keys and YAML aliases", async () => {
    const unsafe = convertDependencies({ content: '{"__proto__":{"polluted":true}}' });
    await expect(executeFileConvertNode(convertInput(unsafe.dependencies))).resolves.toMatchObject({
      output: { error: { code: "unsafe_file_key" } },
    });

    const aliases = convertDependencies({
      filename: "messages.yaml",
      content: "base: &base\n  hello: Hello\ncopy: *base\n",
    });
    await expect(executeFileConvertNode(convertInput(aliases.dependencies))).resolves.toMatchObject(
      { output: { error: { code: "invalid_file_format" } } },
    );
  });

  it("is wired into the production executor", async () => {
    const result = await executeVisualWorkflowNode({
      node: {
        id: "convert",
        type: "action.file_convert",
        config: { kind: "action.file_convert", fileId: "not-a-file", targetFormat: "json" },
      },
      context: { trigger: {}, nodes: {} },
      organizationId,
      inputsResolved: true,
    });

    expect(result).toMatchObject({
      switchCase: "error",
      output: { error: { code: "invalid_file_reference" } },
    });
  });
});
