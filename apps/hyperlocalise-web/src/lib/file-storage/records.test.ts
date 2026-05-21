import { describe, expect, it } from "vite-plus/test";

import type { FileStorageAdapter, PutStoredObjectInput } from ".";
import {
  createStoredFile,
  createStoredFileId,
  normalizeSourcePath,
  safePathPart,
  sha256Hex,
  storageKey,
} from "./records";

describe("normalizeSourcePath", () => {
  it("removes stacked leading current-directory segments", () => {
    expect(normalizeSourcePath("././src/foo.ts")).toBe("src/foo.ts");
  });

  it("normalizes windows separators and repeated slashes", () => {
    expect(normalizeSourcePath(".\\src\\\\locales\\en.json")).toBe("src/locales/en.json");
  });

  it("only removes current-directory segments from the start", () => {
    expect(normalizeSourcePath("src/./locales/en.json")).toBe("src/./locales/en.json");
  });
});

describe("safePathPart", () => {
  it("keeps storage-safe filename characters", () => {
    expect(safePathPart("messages.en-US_2026.json")).toBe("messages.en-US_2026.json");
  });

  it("replaces unsafe path characters", () => {
    expect(safePathPart("org/id with spaces:prod")).toBe("org_id_with_spaces_prod");
  });
});

describe("storageKey", () => {
  it("builds workspace-scoped storage keys", () => {
    expect(
      storageKey({
        organizationId: "org/demo",
        id: "file_123",
        filename: "source file.xliff",
      }),
    ).toBe("organizations/org_demo/workspace/files/file_123/source_file.xliff");
  });

  it("builds project-scoped storage keys", () => {
    expect(
      storageKey({
        organizationId: "org_demo",
        projectId: "project/acme",
        id: "file_123",
        filename: "source.json",
      }),
    ).toBe("organizations/org_demo/projects/project_acme/files/file_123/source.json");
  });
});

describe("createStoredFileId", () => {
  it("creates file-prefixed identifiers", () => {
    expect(createStoredFileId()).toMatch(/^file_[0-9a-f-]{36}$/);
  });
});

describe("sha256Hex", () => {
  it("hashes the visible bytes of a sliced buffer", async () => {
    const content = Buffer.from("xhello!").subarray(1, 6);

    await expect(sha256Hex(content)).resolves.toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
  });
});

describe("createStoredFile", () => {
  it("uploads content and stores the returned object metadata", async () => {
    const putInputs: PutStoredObjectInput[] = [];
    let insertedValues: Record<string, unknown> | null = null;
    const adapter: FileStorageAdapter = {
      provider: "vercel_blob",
      put: async (input) => {
        putInputs.push(input);
        return {
          provider: "vercel_blob",
          key: input.key,
          url: `https://blob.example/${input.key}`,
          downloadUrl: `https://download.example/${input.key}`,
          contentType: input.contentType,
          etag: "etag_123",
        };
      },
      get: async () => ({
        body: new ReadableStream(),
        contentType: "text/plain",
        etag: null,
      }),
      getSignedUrl: async () => "https://download.example/signed",
      delete: async () => {},
    };
    const dbClient = {
      insert: () => ({
        values: (values: Record<string, unknown>) => {
          insertedValues = values;
          return {
            returning: async () => [values],
          };
        },
      }),
    } as unknown as Parameters<typeof createStoredFile>[0]["db"];

    const file = await createStoredFile({
      organizationId: "org/id",
      projectId: "project/id",
      role: "source",
      sourceKind: "repository_file",
      filename: "source file.json",
      contentType: "application/json",
      content: new Uint8Array([123, 125]),
      metadata: { sourcePath: "./locales/en.json" },
      adapter,
      db: dbClient,
    });

    const putInput = putInputs[0];
    if (!putInput) {
      throw new Error("Expected file storage put to be called.");
    }
    expect(putInput).toEqual({
      key: expect.stringMatching(
        /^organizations\/org_id\/projects\/project_id\/files\/file_[0-9a-f-]{36}\/source_file\.json$/,
      ),
      body: Buffer.from("{}"),
      contentType: "application/json",
    });
    const uploadedKey = putInput.key;
    expect(insertedValues).toMatchObject({
      organizationId: "org/id",
      projectId: "project/id",
      role: "source",
      sourceKind: "repository_file",
      storageProvider: "vercel_blob",
      storageKey: uploadedKey,
      storageUrl: `https://blob.example/${uploadedKey}`,
      downloadUrl: `https://download.example/${uploadedKey}`,
      filename: "source file.json",
      contentType: "application/json",
      byteSize: 2,
      sha256: "44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a",
      etag: "etag_123",
      metadata: { sourcePath: "./locales/en.json" },
    });
    expect(file).toBe(insertedValues);
  });

  it("deletes the uploaded object when the database insert fails", async () => {
    const deletedKeys: string[] = [];
    const adapter: FileStorageAdapter = {
      provider: "vercel_blob",
      put: async (input) => ({
        provider: "vercel_blob",
        key: input.key,
        url: `https://blob.example/${input.key}`,
        downloadUrl: null,
        contentType: input.contentType,
        etag: null,
      }),
      get: async () => ({
        body: new ReadableStream(),
        contentType: "text/plain",
        etag: null,
      }),
      getSignedUrl: async () => "https://download.example/signed",
      delete: async ({ keyOrUrl }) => {
        deletedKeys.push(keyOrUrl);
      },
    };
    const dbClient = {
      insert: () => ({
        values: () => ({
          returning: async () => {
            throw new Error("insert failed");
          },
        }),
      }),
    } as unknown as Parameters<typeof createStoredFile>[0]["db"];

    await expect(
      createStoredFile({
        organizationId: "org_demo",
        role: "source",
        sourceKind: "chat_upload",
        filename: "source.json",
        contentType: "application/json",
        content: Buffer.from("{}"),
        adapter,
        db: dbClient,
      }),
    ).rejects.toThrow("insert failed");

    expect(deletedKeys).toEqual([
      expect.stringMatching(
        /^organizations\/org_demo\/workspace\/files\/file_[0-9a-f-]{36}\/source\.json$/,
      ),
    ]);
  });
});
