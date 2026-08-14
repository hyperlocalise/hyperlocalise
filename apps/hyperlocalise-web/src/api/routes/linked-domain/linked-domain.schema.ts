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

export const createLinkedDomainBodySchema = z.object({
  domainSlug: z.string().trim().min(1).max(256),
});

export const linkedDomainIdParamSchema = z.object({
  linkedDomainId: z.string().uuid(),
});

export const verifyLinkedDomainBodySchema = z
  .object({
    method: z.enum(["dns_txt", "html_file", "meta_tag"]),
    /** Attach to an existing workspace project. Omit (or set createProject) to seed a new one. */
    projectId: z.string().trim().min(1).max(128).optional(),
    createProject: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.projectId && value.createProject === true) {
      ctx.addIssue({
        code: "custom",
        message: "Provide either projectId or createProject, not both.",
        path: ["projectId"],
      });
    }
  });
