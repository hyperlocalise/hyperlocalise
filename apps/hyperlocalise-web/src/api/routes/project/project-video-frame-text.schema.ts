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
import { z } from "zod";
import { projectIdSchema } from "@/lib/projects/identity/project-id";

export const MAX_VIDEO_FRAME_BODY_BYTES = 3 * 1024 * 1024;
export const videoFrameParamsSchema = z.object({
  projectId: projectIdSchema,
  fileId: z.string().trim().min(1).max(128),
});
export const videoFrameTextSchema = z.object({
  timestamp: z.number().finite().min(0).max(30),
  frame: z
    .string()
    .max(MAX_VIDEO_FRAME_BODY_BYTES)
    .regex(/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/),
});
