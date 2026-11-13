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

export const sendTranslationAsSourceBodySchema = z.object({
  sourcePath: z.string().trim().min(1).max(2048),
  destinationProjectId: projectIdSchema,
  /** The other project's version at that path, shown to the person, that the send replaces. */
  replaceVersionId: z.uuid().optional(),
});

export const translationAsSourceDestinationFileQuerySchema = z.object({
  sourcePath: z.string().trim().min(1).max(2048),
  destinationProjectId: projectIdSchema,
});
