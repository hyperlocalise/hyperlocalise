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
export type KnowledgeMemoryRecord = {
  revisionId: string | null;
  version: number;
  content: string;
  summary: string | null;
  updatedAt: string | null;
  updatedByUserId: string | null;
};

export type KnowledgeMemoryRevision = {
  revisionId: string;
  version: number;
  content: string;
  summary: string;
  createdAt: string;
  createdByUserId: string | null;
  createdByName: string | null;
  isCurrent: boolean;
};

export type KnowledgeMemoryRevisionMetadata = Omit<KnowledgeMemoryRevision, "content">;

export type KnowledgeMemoryCommitResult = {
  knowledgeMemory: KnowledgeMemoryRecord;
  changed: boolean;
};

export type KnowledgeMemoryCommitError = {
  code: "precondition_failed";
  current: KnowledgeMemoryRecord;
};

export type KnowledgeMemoryRestoreError =
  | KnowledgeMemoryCommitError
  | { code: "revision_not_found" };

export type CurrentKnowledgeMemoryRow = {
  revisionId: string;
  version: number;
  content: string;
  summary: string;
  updatedAt: Date;
  updatedByUserId: string | null;
};

export type RevisionAuthorRow = {
  createdByUserId: string | null;
  createdByFirstName: string | null;
  createdByLastName: string | null;
};
