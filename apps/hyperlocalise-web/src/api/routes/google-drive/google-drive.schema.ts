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

export const googleDriveChildrenQuerySchema = z.object({
  driveId: z.string().trim().optional(),
  folderId: z.string().trim().min(1),
  showTranslations: z
    .union([z.literal("true"), z.literal("false")])
    .optional()
    .transform((value) => value === "true"),
  depth: z.coerce.number().int().min(0).max(10).optional().default(0),
  pageToken: z.string().trim().optional(),
});

export const googleDriveAddFolderBodySchema = z.object({
  driveId: z.string().trim().optional().nullable(),
  folderId: z.string().trim().min(1),
  name: z.string().trim().min(1).max(512),
  pathLabel: z.string().trim().min(1).max(2048),
});

export const googleDriveFolderIdParamSchema = z.object({
  folderRecordId: z.string().uuid(),
});
