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
  ProjectFileStringContextBody,
  ProjectFileStringContextResponse,
} from "@/api/routes/project/project.schema";

export class GoSvcCatApi {
  constructor(private readonly request: GoSvcRequest) {}

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
