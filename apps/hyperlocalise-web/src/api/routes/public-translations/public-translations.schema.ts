/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { z } from "zod";

import { projectIdSchema } from "@/lib/projects/identity/project-id";

export const publicTranslationProjectParamsSchema = z.object({
  projectId: projectIdSchema,
});

export const downloadPublicTranslationsQuerySchema = z.object({
  sourcePath: z.string().trim().min(1).max(2048),
  locale: z.string().trim().min(1).max(32),
});

export type PublicTranslationProjectParams = z.infer<typeof publicTranslationProjectParamsSchema>;
export type DownloadPublicTranslationsQuery = z.infer<typeof downloadPublicTranslationsQuerySchema>;
