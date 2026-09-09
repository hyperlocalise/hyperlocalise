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
import { imageTextLayersSchema } from "@/lib/projects/files/image-text-layers";

export const projectImageTextLayersParamsSchema = z.object({
  projectId: projectIdSchema,
  fileId: z.string().trim().min(1).max(128),
});
export const updateProjectImageTextLayersSchema = imageTextLayersSchema;
