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
import "server-only";

import mammoth from "mammoth";

import { WORKSPACE_AUTOMATION_KNOWLEDGE_MAX_EXTRACTED_CHARS } from "./workspace-automation-knowledge-constants";

export {
  isSupportedWorkspaceAutomationKnowledgeFilename,
  WORKSPACE_AUTOMATION_KNOWLEDGE_ACCEPT_EXTENSIONS,
  WORKSPACE_AUTOMATION_KNOWLEDGE_MAX_EXTRACTED_CHARS,
} from "./workspace-automation-knowledge-constants";

const TEXT_EXTENSIONS = new Set([".txt", ".md", ".markdown", ".csv", ".json"]);
const DOCX_EXTENSIONS = new Set([".docx"]);
const PDF_EXTENSIONS = new Set([".pdf"]);

export type KnowledgeTextExtractResult = {
  text: string;
  truncated: boolean;
  format: "text" | "docx" | "pdf" | "unsupported";
};

function filenameExtension(filename: string) {
  const index = filename.lastIndexOf(".");
  if (index < 0) {
    return "";
  }
  return filename.slice(index).toLowerCase();
}

function truncateExtractedText(text: string): { text: string; truncated: boolean } {
  const normalized = text.split("\0").join("").trim();
  if (normalized.length <= WORKSPACE_AUTOMATION_KNOWLEDGE_MAX_EXTRACTED_CHARS) {
    return { text: normalized, truncated: false };
  }

  return {
    text: normalized.slice(0, WORKSPACE_AUTOMATION_KNOWLEDGE_MAX_EXTRACTED_CHARS),
    truncated: true,
  };
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  const { extractText } = await import("unpdf");
  const extracted = await extractText(new Uint8Array(buffer), { mergePages: true });
  return extracted.text;
}

export async function extractWorkspaceAutomationKnowledgeText(input: {
  filename: string;
  contentType?: string;
  content: Buffer;
}): Promise<KnowledgeTextExtractResult> {
  const extension = filenameExtension(input.filename);
  const contentType = (input.contentType ?? "").toLowerCase();

  if (
    TEXT_EXTENSIONS.has(extension) ||
    contentType.startsWith("text/") ||
    contentType.includes("json")
  ) {
    const { text, truncated } = truncateExtractedText(input.content.toString("utf8"));
    return { text, truncated, format: "text" };
  }

  if (DOCX_EXTENSIONS.has(extension) || contentType.includes("wordprocessingml")) {
    const extracted = await mammoth.extractRawText({
      arrayBuffer: input.content.buffer.slice(
        input.content.byteOffset,
        input.content.byteOffset + input.content.byteLength,
      ) as ArrayBuffer,
    });
    const { text, truncated } = truncateExtractedText(extracted.value);
    return { text, truncated, format: "docx" };
  }

  if (PDF_EXTENSIONS.has(extension) || contentType === "application/pdf") {
    const extracted = await extractPdfText(input.content);
    const { text, truncated } = truncateExtractedText(extracted);
    return { text, truncated, format: "pdf" };
  }

  return { text: "", truncated: false, format: "unsupported" };
}
