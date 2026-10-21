/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License 1.1,
 * use of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import type { ProjectFileContentEditorTranslationResponse } from "@/api/routes/project/project.schema";

export type CatRevisionActorKind = "user" | "agent" | "api_key" | "system";

export type CatRevisionProvenance = "manual" | "translation_job" | "import" | "agent";

/** One saved version of a translation, newest first. */
export interface CatSegmentRevision {
  id: string;
  text: string;
  status: string;
  provenance: CatRevisionProvenance;
  sourceJobId: string | null;
  operationId: string | null;
  restoredFromRevisionId: string | null;
  /** True for the version the translation holds now. */
  isCurrent: boolean;
  createdAt: string;
  actor: {
    kind: CatRevisionActorKind;
    displayName: string;
    userId: string | null;
  };
}

export interface CatSegmentRevisionsQuery {
  sourcePath: string;
  targetLocale: string;
  limit?: number;
  cursor?: string;
}

export interface CatSegmentRevisionsResponse {
  revisions: CatSegmentRevision[];
  nextCursor: string | null;
}

export interface CatRestoreRevisionBody {
  sourcePath: string;
  targetLocale: string;
  /** The version the editor shows as current; go-svc rejects the restore when it is stale. */
  expectedCurrentRevisionId?: string;
}

export interface CatRestoreRevisionResponse {
  translation: ProjectFileContentEditorTranslationResponse["translation"];
  revisionId: string;
}

export interface CatUndoOperationResponse {
  operationId: string;
  restoredCount: number;
  skippedChangedCount: number;
  skippedLockedCount: number;
}
