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

import { downloadPublicTranslationsQuerySchema } from "@/api/routes/public-translations/public-translations.schema";
import { projectIdSchema } from "@/lib/projects/identity/project-id";

const sourceDownloadShape = downloadPublicTranslationsQuerySchema.shape;

export const mcpDownloadTranslationsInputSchema = z.object({
  projectId: projectIdSchema.describe("ID of the accessible Hyperlocalise project."),
  sourcePath: sourceDownloadShape.sourcePath.describe(
    "Repository-relative path of the source file.",
  ),
  locale: sourceDownloadShape.locale.describe(
    "Target locale whose reconstructed translation file should be returned.",
  ),
});
