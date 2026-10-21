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
import type {
  EditorExportBody,
  GoSvcRecord,
  GoSvcRequestOptions,
  ValidateSegmentBody,
  ValidateSegmentResult,
} from "./go-svc-client.types";
import { catPath, orgPath, type GoSvcRequest } from "./go-svc-request";
import type {
  ProjectFileCatTargetsInput,
  ProjectFileCatTargetRow,
  ProjectFileContentEditorActivityLogQuery,
  ProjectFileContentEditorCommentBody,
  ProjectFileContentEditorCommentResolveBody,
  ProjectFileContentEditorCommentResolveResponse,
  ProjectFileContentEditorCommentResponse,
  ProjectFileCatTmSegmentResponse,
  ProjectFileContentEditorConcordanceBody,
  ProjectFileContentEditorConcordanceResponse,
  ProjectFileContentEditorHiddenStringsBody,
  ProjectFileContentEditorHiddenStringsResponse,
  ProjectFileContentEditorImageStatusBody,
  ProjectFileContentEditorLockedStringsBody,
  ProjectFileContentEditorLockedStringsResponse,
  ProjectFileContentEditorMaxLengthBody,
  ProjectFileContentEditorMaxLengthResponse,
  ProjectFileContentEditorQuery,
  ProjectFileContentEditorQueueResponse,
  ProjectFileContentEditorSegmentCommentsResponse,
  ProjectFileContentEditorSegmentQuery,
  ProjectFileContentEditorSegmentTargetResponse,
  ProjectFileContentEditorTranslationBody,
  ProjectFileContentEditorTranslationResponse,
  ProjectFileContentEditorTreatAsImageBody,
  ProjectFileContentEditorTreatAsVideoBody,
  ProjectFileContentEditorVisualContextBindBody,
  ProjectFileContentEditorVisualContextBindResponse,
  ProjectFileContentEditorVisualContextBody,
  ProjectFileContentEditorVisualContextFinalizeBody,
  ProjectFileContentEditorVisualContextFinalizeResponse,
  ProjectFileContentEditorVisualContextMatchBody,
  ProjectFileContentEditorVisualContextMatchResponse,
  ProjectFileContentEditorVisualContextResponse,
  ProjectFileContentEditorVisualContextUploadBody,
  ProjectFileContentEditorVisualContextUploadResponse,
  ProjectFileStringContextBody,
  ProjectFileStringContextResponse,
} from "@/api/routes/project/project.schema";

import type {
  CatDocumentParseBackBody,
  CatDocumentParseBackResponse,
} from "./go-svc-cat-document.types";
import type { CatGroupVariant, CatGroupVariantsQuery } from "./go-svc-cat-groups.types";
import type {
  CatRestoreRevisionBody,
  CatRestoreRevisionResponse,
  CatSegmentRevisionsQuery,
  CatSegmentRevisionsResponse,
  CatUndoOperationResponse,
} from "./go-svc-cat-revisions.types";

export class GoSvcCatApi {
  constructor(private readonly request: GoSvcRequest) {}

  groupVariants(
    organizationSlug: string,
    projectId: string,
    externalStringId: string,
    query: CatGroupVariantsQuery,
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<{ variants: CatGroupVariant[] }>(
      catPath(organizationSlug, projectId, "segments", externalStringId, "variants"),
      { query, ...options },
    );
  }

  targets(
    organizationSlug: string,
    projectId: string,
    body: ProjectFileCatTargetsInput,
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<{ targets: ProjectFileCatTargetRow[] }>(
      catPath(organizationSlug, projectId, "targets"),
      {
        method: "POST",
        body: {
          segments: body.segments.map(({ externalStringId, sourcePath }) => ({
            externalStringId,
            sourcePath,
          })),
          targetLocales: body.targetLocales,
        },
        ...options,
      },
    );
  }

  queue(
    organizationSlug: string,
    projectId: string,
    query: ProjectFileContentEditorQuery,
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<ProjectFileContentEditorQueueResponse>(
      catPath(organizationSlug, projectId, "queue"),
      { query, ...options },
    );
  }

  activityLogs(
    organizationSlug: string,
    projectId: string,
    query: ProjectFileContentEditorActivityLogQuery,
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<{
      activityLogs: GoSvcRecord[];
      nextCursor?: string | null;
    }>(catPath(organizationSlug, projectId, "activity-logs"), { query, ...options });
  }

  segmentTarget(
    organizationSlug: string,
    projectId: string,
    externalStringId: string,
    query: ProjectFileContentEditorSegmentQuery,
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<ProjectFileContentEditorSegmentTargetResponse>(
      catPath(organizationSlug, projectId, "segments", externalStringId, "target"),
      { query, ...options },
    );
  }

  segmentRevisions(
    organizationSlug: string,
    projectId: string,
    externalStringId: string,
    query: CatSegmentRevisionsQuery,
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<CatSegmentRevisionsResponse>(
      catPath(organizationSlug, projectId, "segments", externalStringId, "revisions"),
      { query, ...options },
    );
  }

  restoreSegmentRevision(
    organizationSlug: string,
    projectId: string,
    externalStringId: string,
    revisionId: string,
    body: CatRestoreRevisionBody,
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<CatRestoreRevisionResponse>(
      catPath(
        organizationSlug,
        projectId,
        "segments",
        externalStringId,
        "revisions",
        revisionId,
        "restore",
      ),
      { method: "POST", body, ...options },
    );
  }

  /** Puts back every string an operation changed, skipping strings edited or locked since. */
  undoOperation(
    organizationSlug: string,
    projectId: string,
    operationId: string,
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<CatUndoOperationResponse>(
      catPath(organizationSlug, projectId, "operations", operationId, "undo"),
      { method: "POST", ...options },
    );
  }

  segmentComments(
    organizationSlug: string,
    projectId: string,
    externalStringId: string,
    query: ProjectFileContentEditorSegmentQuery,
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<ProjectFileContentEditorSegmentCommentsResponse>(
      catPath(organizationSlug, projectId, "segments", externalStringId, "comments"),
      { query, ...options },
    );
  }

  saveTranslation(
    organizationSlug: string,
    projectId: string,
    body: ProjectFileContentEditorTranslationBody,
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<ProjectFileContentEditorTranslationResponse>(
      catPath(organizationSlug, projectId, "translations"),
      { method: "POST", body, ...options },
    );
  }

  /** Maps an edited Markdown or HTML target onto the file's segments without saving it. */
  parseBackDocument(
    organizationSlug: string,
    projectId: string,
    body: CatDocumentParseBackBody,
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<CatDocumentParseBackResponse>(
      catPath(organizationSlug, projectId, "document", "parse-back"),
      { method: "POST", body, ...options },
    );
  }

  saveComment(
    organizationSlug: string,
    projectId: string,
    body: ProjectFileContentEditorCommentBody,
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<ProjectFileContentEditorCommentResponse>(
      catPath(organizationSlug, projectId, "comments"),
      { method: "POST", body, ...options },
    );
  }

  resolveComment(
    organizationSlug: string,
    projectId: string,
    commentId: string,
    body: ProjectFileContentEditorCommentResolveBody,
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<ProjectFileContentEditorCommentResolveResponse>(
      catPath(organizationSlug, projectId, "comments", commentId, "resolve"),
      { method: "PATCH", body, ...options },
    );
  }

  concordance(
    organizationSlug: string,
    projectId: string,
    body: ProjectFileContentEditorConcordanceBody,
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<ProjectFileContentEditorConcordanceResponse>(
      catPath(organizationSlug, projectId, "concordance"),
      { method: "POST", body, ...options },
    );
  }

  tmSegment(
    organizationSlug: string,
    projectId: string,
    entryId: string,
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<ProjectFileCatTmSegmentResponse>(
      catPath(organizationSlug, projectId, "tm-segments", entryId),
      options,
    );
  }

  updateTmSegment(
    organizationSlug: string,
    projectId: string,
    entryId: string,
    body: {
      sourceText: string;
      records: Array<{ id: string; text: string; expectedVersion: number }>;
    },
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<ProjectFileCatTmSegmentResponse>(
      catPath(organizationSlug, projectId, "tm-segments", entryId),
      { method: "PATCH", body, ...options },
    );
  }

  deleteTmSegmentRecord(
    organizationSlug: string,
    projectId: string,
    entryId: string,
    recordId: string,
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<void>(
      catPath(organizationSlug, projectId, "tm-segments", entryId, "records", recordId),
      { method: "DELETE", ...options },
    );
  }

  visualContext(
    organizationSlug: string,
    projectId: string,
    body: ProjectFileContentEditorVisualContextBody,
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<ProjectFileContentEditorVisualContextResponse>(
      catPath(organizationSlug, projectId, "visual-context"),
      { method: "POST", body, ...options },
    );
  }

  createVisualContextScreenshot(
    organizationSlug: string,
    projectId: string,
    body: ProjectFileContentEditorVisualContextUploadBody,
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<ProjectFileContentEditorVisualContextUploadResponse>(
      catPath(organizationSlug, projectId, "visual-context", "screenshots"),
      { method: "POST", body, ...options },
    );
  }

  finalizeVisualContextScreenshot(
    organizationSlug: string,
    projectId: string,
    screenshotId: string,
    body: ProjectFileContentEditorVisualContextFinalizeBody = {},
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<ProjectFileContentEditorVisualContextFinalizeResponse>(
      catPath(
        organizationSlug,
        projectId,
        "visual-context",
        "screenshots",
        screenshotId,
        "finalize",
      ),
      { method: "POST", body, ...options },
    );
  }

  matchVisualContextScreenshot(
    organizationSlug: string,
    projectId: string,
    screenshotId: string,
    body: ProjectFileContentEditorVisualContextMatchBody = {},
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<ProjectFileContentEditorVisualContextMatchResponse>(
      catPath(organizationSlug, projectId, "visual-context", "screenshots", screenshotId, "match"),
      { method: "POST", body, ...options },
    );
  }

  visualContextMatchProcess(
    organizationSlug: string,
    projectId: string,
    processId: string,
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<ProjectFileContentEditorVisualContextMatchResponse>(
      catPath(organizationSlug, projectId, "visual-context", "processes", processId),
      options,
    );
  }

  bindVisualContextScreenshot(
    organizationSlug: string,
    projectId: string,
    screenshotId: string,
    body: ProjectFileContentEditorVisualContextBindBody,
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<ProjectFileContentEditorVisualContextBindResponse>(
      catPath(
        organizationSlug,
        projectId,
        "visual-context",
        "screenshots",
        screenshotId,
        "bindings",
      ),
      { method: "POST", body, ...options },
    );
  }

  unbindVisualContextScreenshot(
    organizationSlug: string,
    projectId: string,
    screenshotId: string,
    bindingId: string,
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<void>(
      catPath(
        organizationSlug,
        projectId,
        "visual-context",
        "screenshots",
        screenshotId,
        "bindings",
        bindingId,
      ),
      { method: "DELETE", ...options },
    );
  }

  deleteVisualContextScreenshot(
    organizationSlug: string,
    projectId: string,
    screenshotId: string,
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<void>(
      catPath(organizationSlug, projectId, "visual-context", "screenshots", screenshotId),
      { method: "DELETE", ...options },
    );
  }

  setHidden(
    organizationSlug: string,
    projectId: string,
    body: ProjectFileContentEditorHiddenStringsBody,
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<ProjectFileContentEditorHiddenStringsResponse>(
      catPath(organizationSlug, projectId, "strings", "hidden"),
      { method: "POST", body, ...options },
    );
  }

  setLocked(
    organizationSlug: string,
    projectId: string,
    body: ProjectFileContentEditorLockedStringsBody,
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<ProjectFileContentEditorLockedStringsResponse>(
      catPath(organizationSlug, projectId, "strings", "locked"),
      { method: "POST", body, ...options },
    );
  }

  setMaxLength(
    organizationSlug: string,
    projectId: string,
    externalStringId: string,
    body: ProjectFileContentEditorMaxLengthBody,
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<ProjectFileContentEditorMaxLengthResponse>(
      catPath(organizationSlug, projectId, "segments", externalStringId, "max-length"),
      { method: "POST", body, ...options },
    );
  }

  treatAsImage(
    organizationSlug: string,
    projectId: string,
    externalStringId: string,
    body: ProjectFileContentEditorTreatAsImageBody,
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<GoSvcRecord>(
      catPath(organizationSlug, projectId, "segments", externalStringId, "treat-as-image"),
      { method: "POST", body, ...options },
    );
  }

  treatAsVideo(
    organizationSlug: string,
    projectId: string,
    externalStringId: string,
    body: ProjectFileContentEditorTreatAsVideoBody,
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<GoSvcRecord>(
      catPath(organizationSlug, projectId, "segments", externalStringId, "treat-as-video"),
      { method: "POST", body, ...options },
    );
  }

  updateImageStatus(
    organizationSlug: string,
    projectId: string,
    body: ProjectFileContentEditorImageStatusBody,
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<GoSvcRecord>(
      catPath(organizationSlug, projectId, "images", "status"),
      { method: "PATCH", body, ...options },
    );
  }

  stringContext(
    organizationSlug: string,
    projectId: string,
    body: ProjectFileStringContextBody,
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<ProjectFileStringContextResponse>(
      orgPath(organizationSlug, "projects", projectId, "files", "string-context"),
      { method: "POST", body, ...options },
    );
  }

  validateSegment(body: ValidateSegmentBody, options: GoSvcRequestOptions = {}) {
    return this.request.json<ValidateSegmentResult>("/v1/validate/segment", {
      method: "POST",
      body,
      ...options,
    });
  }

  exportFilteredEditorRows(body: EditorExportBody, options: GoSvcRequestOptions = {}) {
    return this.request.download("/v1/editor-export/filtered/serialize", {
      method: "POST",
      body,
      ...options,
    });
  }
}
