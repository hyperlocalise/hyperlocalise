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

export const WORKSPACE_AUTOMATION_KNOWLEDGE_MAX_FILES = 20;
export const WORKSPACE_AUTOMATION_KNOWLEDGE_MAX_BYTES = 25 * 1024 * 1024;
export const WORKSPACE_AUTOMATION_KNOWLEDGE_MAX_EXTRACTED_CHARS = 100_000;

export const WORKSPACE_AUTOMATION_KNOWLEDGE_ACCEPT_EXTENSIONS = [
  ".pdf",
  ".txt",
  ".md",
  ".markdown",
  ".csv",
  ".json",
  ".docx",
] as const;

const ACCEPT_EXTENSIONS = new Set<string>(WORKSPACE_AUTOMATION_KNOWLEDGE_ACCEPT_EXTENSIONS);

export type WorkspaceAutomationKnowledgeFileRecord = {
  id: string;
  organizationId: string;
  automationId: string;
  storedFileId: string;
  filename: string;
  contentType: string;
  byteSize: number;
  extractedText: string;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WorkspaceAutomationKnowledgeFileSummary = Omit<
  WorkspaceAutomationKnowledgeFileRecord,
  "extractedText"
> & {
  extractedCharacterCount: number;
};

export function isSupportedWorkspaceAutomationKnowledgeFilename(filename: string) {
  const index = filename.lastIndexOf(".");
  if (index < 0) {
    return false;
  }
  return ACCEPT_EXTENSIONS.has(filename.slice(index).toLowerCase());
}
