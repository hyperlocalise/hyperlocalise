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

export const KNOWLEDGE_UPLOAD_MAX_FILES = 1;

export const KNOWLEDGE_UPLOAD_ACCEPT =
  ".csv,.json,.pdf,.xlsx,.xls,.txt,.md,.docx,.pptx,text/csv,application/json,application/pdf,text/plain,text/markdown";

export const KNOWLEDGE_UPLOAD_EXTENSIONS = [
  ".csv",
  ".json",
  ".pdf",
  ".xlsx",
  ".xls",
  ".txt",
  ".md",
  ".docx",
  ".pptx",
] as const;

export type KnowledgeUploadActionId =
  | "google-drive"
  | "sharepoint"
  | "notion"
  | "import-website"
  | "markdown-text";

export function filterKnowledgeUploadFiles(files: FileList | File[]): File[] {
  const list = Array.from(files);
  const allowed = new Set(KNOWLEDGE_UPLOAD_EXTENSIONS.map((extension) => extension.toLowerCase()));

  return list
    .filter((file) => {
      const name = file.name.toLowerCase();
      return Array.from(allowed).some((extension) => name.endsWith(extension));
    })
    .slice(0, KNOWLEDGE_UPLOAD_MAX_FILES);
}
