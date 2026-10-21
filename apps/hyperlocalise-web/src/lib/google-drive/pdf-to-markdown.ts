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

async function extractPdfText(buffer: Buffer): Promise<string> {
  const { extractText } = await import("unpdf");
  const result = await extractText(buffer);
  if (typeof result === "string") {
    return result;
  }
  if (result && typeof result === "object" && "text" in result && typeof result.text === "string") {
    return result.text;
  }
  return "";
}

export async function pdfBufferToMarkdown(buffer: Buffer): Promise<string> {
  const text = (await extractPdfText(buffer)).trim();
  if (!text) {
    return "";
  }
  const paragraphs = text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  return paragraphs.join("\n\n");
}
