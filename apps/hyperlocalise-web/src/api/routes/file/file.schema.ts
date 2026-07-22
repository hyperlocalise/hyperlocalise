/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { z } from "zod";

export const fileParamsSchema = z.object({
  organizationSlug: z.string().trim().min(1).max(128),
  fileId: z.string().trim().min(1).max(128),
});

export type FileParams = z.infer<typeof fileParamsSchema>;
