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
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import {
  isWriteBackApproveAllowed,
  isWriteBackTranslationAllowed,
} from "@/api/auth/capability-guards";
import { ownedProjectWhere } from "@/api/auth/team-access";
import type { ApiAuthContext } from "@/api/auth/workos";
import {
  MCP_CREATE_TOOL,
  MCP_READ_ONLY_TOOL,
  mcpToolError,
  mcpToolJson,
} from "@/api/routes/mcp/mcp-tool-result";
import {
  setMcpTranslationStatus,
  updateMcpTranslation,
} from "@/api/routes/mcp/mcp-update-translation";
import { projectFileCatStatusBodySchema } from "@/api/routes/project/project.schema";
import { resolveProjectResourceTarget } from "@/api/routes/project/project.shared";
import {
  enqueueStringSegmentApprovedActivity,
  enqueueStringSegmentCommentedActivity,
  enqueueStringSegmentStatusChangedActivity,
  sessionActivityActor,
} from "@/lib/activity-log/file-segment-events";
import { PRODUCT_USAGE_ANALYTICS_EVENTS } from "@/lib/analytics/events";
import { serverAnalytics } from "@/lib/analytics/server";
import { db, schema } from "@/lib/database/client";
import { projectIdSchema } from "@/lib/projects/identity/project-id";
import { trackNativeCatCommentProductUsage } from "@/lib/projects/content-editor/native-cat-product-analytics";
import {
  getNativeProjectContentEditorSegmentComments,
  getNativeProjectContentEditorSegmentDetail,
  saveNativeProjectContentEditorComment,
} from "@/lib/projects/content-editor/native-content-editor-service";

export const MCP_BULK_TRANSLATION_UPDATE_MAX_ITEMS = 50;
const MCP_TRANSLATION_COMMENT_MAX_LENGTH = 16_384;

const translationRefShape = {
  projectId: projectIdSchema.describe("ID of the accessible Hyperlocalise project."),
  translationKeyId: z.uuid().describe("UUID returned as id by list_translations."),
  targetLocale: z.string().trim().min(1).max(32).describe("BCP-47 target locale tag."),
};

const mcpListTranslationCommentsInputSchema = z.object(translationRefShape);

const mcpAddTranslationCommentInputSchema = z.object({
  ...translationRefShape,
  text: z
    .string()
    .trim()
    .min(1)
    .max(MCP_TRANSLATION_COMMENT_MAX_LENGTH)
    .describe(
      "Comment text visible to translators and reviewers in the Content Editor. Use create_issue for problems that need tracking.",
    ),
});

const mcpSetTranslationStatusInputSchema = z.object({
  ...translationRefShape,
  status: projectFileCatStatusBodySchema.shape.status.describe(
    "Review decision: approved, rejected, or needs_review to send it back for another pass.",
  ),
});

const mcpUpdateTranslationsInputSchema = z.object({
  projectId: translationRefShape.projectId,
  updates: z
    .array(
      z.object({
        translationKeyId: translationRefShape.translationKeyId,
        targetLocale: translationRefShape.targetLocale,
        targetText: z.string().max(100_000).describe("New translated text to save."),
        approve: z
          .boolean()
          .optional()
          .describe("Approve the translation after saving it. Defaults to false."),
      }),
    )
    .min(1)
    .max(MCP_BULK_TRANSLATION_UPDATE_MAX_ITEMS)
    .describe(
      `Up to ${MCP_BULK_TRANSLATION_UPDATE_MAX_ITEMS} translations to save. Each row is validated and saved independently.`,
    ),
});

type NativeMcpProject = {
  id: string;
  targetLocales: string[];
};

async function resolveNativeMcpProject(
  apiAuth: ApiAuthContext,
  projectId: string,
): Promise<
  { ok: true; project: NativeMcpProject } | { ok: false; error: ReturnType<typeof mcpToolError> }
> {
  const target = await resolveProjectResourceTarget(apiAuth, projectId);

  if (target.kind !== "native") {
    return {
      ok: false,
      error: mcpToolError(
        "provider_cat_unsupported",
        "Provider-only CAT translations are not supported",
      ),
    };
  }

  const [project] = await db
    .select({
      id: schema.projects.id,
      targetLocales: schema.projects.targetLocales,
    })
    .from(schema.projects)
    .where(await ownedProjectWhere(apiAuth, target.projectId))
    .limit(1);

  if (!project) {
    return {
      ok: false,
      error: mcpToolError("project_not_found", "Project not found or inaccessible"),
    };
  }

  return { ok: true, project };
}

function translationNotFound() {
  return mcpToolError("translation_not_found", "Translation not found");
}

export function registerTranslatorMcpTools(server: McpServer, apiAuth: ApiAuthContext) {
  const organizationId = apiAuth.organization.localOrganizationId;
  const actorUserId = apiAuth.user.localUserId;

  server.registerTool(
    "list_translation_comments",
    {
      annotations: MCP_READ_ONLY_TOOL,
      description:
        "List Content Editor comments left on one translation by translators, reviewers, or agents. Read these before editing a string so earlier feedback is not lost.",
      inputSchema: mcpListTranslationCommentsInputSchema,
    },
    async ({ projectId, translationKeyId, targetLocale }) => {
      const resolved = await resolveNativeMcpProject(apiAuth, projectId);
      if (!resolved.ok) {
        return resolved.error;
      }

      const { project } = resolved;
      if (!project.targetLocales.includes(targetLocale)) {
        return translationNotFound();
      }

      const detail = await getNativeProjectContentEditorSegmentDetail({
        organizationId,
        projectId: project.id,
        translationKeyId,
        targetLocale,
      });
      if (!detail) {
        return translationNotFound();
      }

      const comments = await getNativeProjectContentEditorSegmentComments({
        organizationId,
        projectId: project.id,
        sourcePath: detail.segment.sourcePath,
        targetLocale,
        externalStringId: translationKeyId,
      });

      return mcpToolJson({
        translationKeyId,
        targetLocale,
        comments: comments.map((comment) => ({
          id: comment.externalCommentId,
          text: comment.text,
          author: comment.author ?? null,
          createdAt: comment.createdAt,
        })),
      });
    },
  );

  server.registerTool(
    "add_translation_comment",
    {
      annotations: MCP_CREATE_TOOL,
      description:
        "Add a Content Editor comment to one translation, for example to explain a wording choice or ask the reviewer a question.",
      inputSchema: mcpAddTranslationCommentInputSchema,
    },
    async ({ projectId, translationKeyId, targetLocale, text }) => {
      if (!isWriteBackTranslationAllowed(apiAuth.membership.role)) {
        return mcpToolError("forbidden", "Insufficient permissions to comment on translations");
      }

      const resolved = await resolveNativeMcpProject(apiAuth, projectId);
      if (!resolved.ok) {
        return resolved.error;
      }

      const { project } = resolved;
      if (!project.targetLocales.includes(targetLocale)) {
        return translationNotFound();
      }

      const detail = await getNativeProjectContentEditorSegmentDetail({
        organizationId,
        projectId: project.id,
        translationKeyId,
        targetLocale,
      });
      if (!detail) {
        return translationNotFound();
      }

      const comment = await saveNativeProjectContentEditorComment({
        organizationId,
        projectId: project.id,
        sourcePath: detail.segment.sourcePath,
        targetLocale,
        translationKeyId,
        text,
        type: "comment",
        actorUserId,
      });
      if (!comment) {
        return translationNotFound();
      }

      trackNativeCatCommentProductUsage({ type: "comment" });
      await enqueueStringSegmentCommentedActivity({
        ...sessionActivityActor(actorUserId),
        organizationId,
        projectId: project.id,
        segmentId: translationKeyId,
        sourcePath: detail.segment.sourcePath,
        targetLocale,
      });

      return mcpToolJson({
        comment: {
          id: comment.externalCommentId,
          text: comment.text,
          author: comment.author ?? null,
          createdAt: comment.createdAt,
        },
      });
    },
  );

  server.registerTool(
    "set_translation_status",
    {
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
      description:
        "Record a review decision on one translation without changing its text: approve it, reject it, or send it back to needs_review. Pair a rejection with add_translation_comment to explain why.",
      inputSchema: mcpSetTranslationStatusInputSchema,
    },
    async ({ projectId, translationKeyId, targetLocale, status }) => {
      if (!isWriteBackTranslationAllowed(apiAuth.membership.role)) {
        return mcpToolError("forbidden", "Insufficient permissions to review translations");
      }

      if (status !== "needs_review" && !isWriteBackApproveAllowed(apiAuth.membership.role)) {
        return mcpToolError(
          "forbidden",
          "Insufficient permissions to approve or reject translations",
        );
      }

      const resolved = await resolveNativeMcpProject(apiAuth, projectId);
      if (!resolved.ok) {
        return resolved.error;
      }

      const { project } = resolved;
      if (!project.targetLocales.includes(targetLocale)) {
        return translationNotFound();
      }

      const result = await setMcpTranslationStatus({
        organizationId,
        projectId: project.id,
        translationKeyId,
        targetLocale,
        status,
        actorUserId,
      });
      if (!result.ok) {
        switch (result.error) {
          case "translation_not_found":
            return translationNotFound();
          case "translation_locked":
            return mcpToolError("translation_locked", "This translation is locked");
          case "invalid_translation":
            return mcpToolError(
              "invalid_translation",
              "Translation has invalid placeholders or ICU syntax",
              { issues: result.issues },
            );
        }
      }

      const activityInput = {
        ...sessionActivityActor(actorUserId),
        organizationId,
        projectId: project.id,
        segmentId: translationKeyId,
        sourcePath: result.value.sourcePath,
        targetLocale,
      };

      if (status === "approved") {
        serverAnalytics.track(PRODUCT_USAGE_ANALYTICS_EVENTS.contentEditorSegmentApproved, {
          source: "native",
          status: "approved",
        });
        await enqueueStringSegmentApprovedActivity(activityInput);
      } else {
        await enqueueStringSegmentStatusChangedActivity({ ...activityInput, nextStatus: status });
      }

      return mcpToolJson({
        id: translationKeyId,
        targetLocale,
        targetText: result.value.targetText,
        status: result.value.status,
      });
    },
  );

  server.registerTool(
    "update_translations",
    {
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
      description: `Save and optionally approve up to ${MCP_BULK_TRANSLATION_UPDATE_MAX_ITEMS} translations in one project. Each row is validated for placeholders and ICU syntax and saved independently, so one invalid row does not block the rest. Returns a per-row result.`,
      inputSchema: mcpUpdateTranslationsInputSchema,
    },
    async ({ projectId, updates }) => {
      if (!isWriteBackTranslationAllowed(apiAuth.membership.role)) {
        return mcpToolError("forbidden", "Insufficient permissions to update translations");
      }

      if (
        updates.some((update) => update.approve) &&
        !isWriteBackApproveAllowed(apiAuth.membership.role)
      ) {
        return mcpToolError("forbidden", "Insufficient permissions to approve translations");
      }

      const resolved = await resolveNativeMcpProject(apiAuth, projectId);
      if (!resolved.ok) {
        return resolved.error;
      }

      const { project } = resolved;
      const results = [];

      // Sequential on purpose: each save reads and writes the same project rows.
      for (const update of updates) {
        if (!project.targetLocales.includes(update.targetLocale)) {
          results.push({
            translationKeyId: update.translationKeyId,
            targetLocale: update.targetLocale,
            ok: false as const,
            error: "translation_not_found",
          });
          continue;
        }

        const result = await updateMcpTranslation({
          organizationId,
          projectId: project.id,
          translationKeyId: update.translationKeyId,
          targetLocale: update.targetLocale,
          targetText: update.targetText,
          approve: update.approve,
          actorUserId,
        });

        if (!result.ok) {
          results.push({
            translationKeyId: update.translationKeyId,
            targetLocale: update.targetLocale,
            ok: false as const,
            error: result.error,
            ...(result.error === "invalid_translation" ? { issues: result.issues } : {}),
          });
          continue;
        }

        serverAnalytics.track(
          update.approve
            ? PRODUCT_USAGE_ANALYTICS_EVENTS.contentEditorSegmentApproved
            : PRODUCT_USAGE_ANALYTICS_EVENTS.contentEditorSegmentDraftSaved,
          { source: "native", status: result.value.status },
        );

        results.push({
          translationKeyId: update.translationKeyId,
          targetLocale: update.targetLocale,
          ok: true as const,
          status: result.value.status,
          updatedAt: result.value.updatedAt,
        });
      }

      const saved = results.filter((result) => result.ok).length;

      return mcpToolJson({
        saved,
        failed: results.length - saved,
        results,
      });
    },
  );
}
