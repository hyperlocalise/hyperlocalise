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
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { validator } from "hono/validator";
import type { AuthVariables } from "@/api/auth/workos";
import { canAccessStoredFile } from "@/api/auth/team-access";
import { isAiActionAllowed, isWriteBackTranslationAllowed } from "@/api/auth/capability-guards";
import { rejectIfAiFeaturesUnavailable } from "@/api/billing/ai-features-response";
import {
  badRequestResponse,
  payloadTooLargeResponse,
  serviceUnavailableResponse,
} from "@/api/response.schema";
import { db, schema } from "@/lib/database/client";
import { extractImageText } from "@/lib/agents/image-text-extraction";
import { fileNotFoundResponse } from "../file/file.shared";
import {
  getOwnedProject,
  projectNotFoundResponse,
  projectForbiddenResponse,
} from "./project.shared";
import {
  MAX_VIDEO_FRAME_BODY_BYTES,
  videoFrameParamsSchema,
  videoFrameTextSchema,
} from "./project-video-frame-text.schema";

export function createProjectVideoFrameTextRoutes() {
  return new Hono<{ Variables: AuthVariables }>().post(
    "/",
    bodyLimit({ maxSize: MAX_VIDEO_FRAME_BODY_BYTES, onError: (c) => payloadTooLargeResponse(c) }),
    validator("param", (value, c) => {
      const result = videoFrameParamsSchema.safeParse(value);
      return result.success ? result.data : fileNotFoundResponse(c);
    }),
    validator("json", (value, c) => {
      const result = videoFrameTextSchema.safeParse(value);
      return result.success ? result.data : badRequestResponse(c, "invalid_video_frame");
    }),
    async (c) => {
      const auth = c.var.auth;
      if (
        !isAiActionAllowed(auth.membership.role) ||
        !isWriteBackTranslationAllowed(auth.membership.role)
      )
        return projectForbiddenResponse(c);
      const params = c.req.valid("param");
      if (!(await getOwnedProject(auth, params.projectId))) return projectNotFoundResponse(c);
      const [file] = await db
        .select()
        .from(schema.storedFiles)
        .where(
          and(
            eq(schema.storedFiles.id, params.fileId),
            eq(schema.storedFiles.projectId, params.projectId),
            eq(schema.storedFiles.organizationId, auth.organization.localOrganizationId),
          ),
        )
        .limit(1);
      if (!file || !(await canAccessStoredFile(auth, file))) return fileNotFoundResponse(c);
      if (file.contentType !== "video/mp4") return badRequestResponse(c, "unsupported_video_type");
      const input = c.req.valid("json");
      const content = Buffer.from(input.frame.slice("data:image/png;base64,".length), "base64");
      // Bound decoded dimensions as well as the request body before sending to vision.
      if (
        content.length < 33 ||
        content.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" ||
        content.toString("ascii", 12, 16) !== "IHDR" ||
        content.readUInt32BE(16) < 1 ||
        content.readUInt32BE(20) < 1 ||
        content.readUInt32BE(16) > 1280 ||
        content.readUInt32BE(20) > 1280
      )
        return badRequestResponse(c, "invalid_video_frame");
      const denied = await rejectIfAiFeaturesUnavailable(c, file.organizationId);
      if (denied) return denied;
      const extracted = await extractImageText({
        content,
        contentType: "image/png",
        organizationId: file.organizationId,
        fileId: file.id,
        signal: c.req.raw.signal,
      });
      if (!extracted.ok)
        return serviceUnavailableResponse(
          c,
          "video_frame_extraction_failed",
          "Could not extract frame text. Please try again.",
        );
      c.header("Cache-Control", "private, no-store");
      return c.json({ frameText: { timestamp: input.timestamp, regions: extracted.value } });
    },
  );
}
