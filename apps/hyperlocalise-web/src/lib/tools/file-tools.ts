import { tool } from "ai";
import { z } from "zod";

import { and, eq } from "drizzle-orm";

import { schema } from "@/lib/database";
import { getFileStorageAdapter } from "@/lib/file-storage";

import type { ToolContext } from "./types";

function bufferFromStream(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    const reader = stream.getReader();

    function read() {
      reader
        .read()
        .then(({ done, value }) => {
          if (done) {
            resolve(Buffer.concat(chunks.map((c) => Buffer.from(c))));
            return;
          }
          if (value) {
            chunks.push(value);
          }
          read();
        })
        .catch(reject);
    }

    read();
  });
}

/**
 * Read the contents of a stored file.
 *
 * Useful when the user has uploaded a file and the agent needs to inspect
 * its contents before creating a translation job or answering questions.
 *
 * Returns the file content as text for text-based formats (JSON, PO, XLIFF,
 * HTML, Markdown, CSV, etc.). Returns an error for binary files.
 */
export function createReadStoredFileTool(ctx: ToolContext) {
  return tool({
    description:
      "Read the text contents of a stored file. Use this to inspect uploaded translation source files before creating jobs.",
    inputSchema: z.object({
      fileId: z.string().describe("The stored file ID to read."),
    }),
    execute: async ({ fileId }) => {
      const [file] = await ctx.db
        .select({
          id: schema.storedFiles.id,
          organizationId: schema.storedFiles.organizationId,
          projectId: schema.storedFiles.projectId,
          storageKey: schema.storedFiles.storageKey,
          filename: schema.storedFiles.filename,
          contentType: schema.storedFiles.contentType,
        })
        .from(schema.storedFiles)
        .where(
          and(
            eq(schema.storedFiles.id, fileId),
            eq(schema.storedFiles.organizationId, ctx.organizationId),
          ),
        )
        .limit(1);

      if (!file) {
        return {
          success: false,
          error: "File not found for this organization.",
        };
      }

      if (ctx.projectId && file.projectId && file.projectId !== ctx.projectId) {
        return {
          success: false,
          error: "File does not belong to the current project.",
        };
      }

      const adapter = getFileStorageAdapter();
      const storedObject = await adapter.get({ keyOrUrl: file.storageKey });

      if (!storedObject) {
        return {
          success: false,
          error: "File could not be retrieved from storage.",
        };
      }

      try {
        const buffer = await bufferFromStream(storedObject.body);

        const isBinary =
          file.contentType.startsWith("image/") ||
          file.contentType === "application/octet-stream" ||
          file.filename.match(/\.(png|jpg|jpeg|webp|gif|bmp|ico|pdf|zip|tar|gz|rar|7z)$/i);

        if (isBinary) {
          return {
            success: false,
            error:
              "Binary files cannot be read as text. Use this tool for text-based translation files only.",
            filename: file.filename,
            byteLength: buffer.byteLength,
          };
        }

        const text = buffer.toString("utf-8");

        return {
          success: true,
          filename: file.filename,
          contentType: file.contentType,
          byteLength: buffer.byteLength,
          content: text.slice(0, 50000),
          truncated: text.length > 50000,
        };
      } catch {
        return {
          success: false,
          error: "Failed to read file content.",
        };
      }
    },
  });
}
