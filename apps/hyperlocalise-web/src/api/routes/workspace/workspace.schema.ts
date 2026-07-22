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

export const updateWorkspaceBodySchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
        message: "Use lowercase letters, numbers, and single hyphens between words",
      })
      .min(2)
      .max(80)
      .optional(),
  })
  .refine((value) => value.name !== undefined || value.slug !== undefined, {
    message: "Provide a name or slug",
  });

export type UpdateWorkspaceBody = z.infer<typeof updateWorkspaceBodySchema>;
