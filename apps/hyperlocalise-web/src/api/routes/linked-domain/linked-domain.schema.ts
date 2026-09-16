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

export const createLinkedDomainBodySchema = z
  .object({
    domainSlug: z.string().trim().min(1).max(256).optional(),
    domain: z.string().trim().min(1).max(2048).optional(),
    marketIds: z.array(z.string().trim().min(1).max(64)).max(16).default([]),
  })
  .superRefine((value, ctx) => {
    if (Boolean(value.domainSlug) === Boolean(value.domain)) {
      ctx.addIssue({
        code: "custom",
        message: "Provide either domainSlug or domain.",
        path: ["domain"],
      });
    }
  });

export const marketRecommendationsBodySchema = z.object({});

export const updateLinkedDomainMarketsBodySchema = z.object({
  marketIds: z.array(z.string().trim().min(1).max(64)).max(16),
});

export const linkedDomainIdParamSchema = z.object({
  linkedDomainId: z.string().uuid(),
});

export const verifyLinkedDomainBodySchema = z
  .object({
    method: z.enum(["dns_txt", "html_file", "meta_tag"]),
    /** Attach to an existing workspace project. Set createProject false to leave it unassigned. */
    projectId: z.string().trim().min(1).max(128).optional(),
    createProject: z.boolean().optional(),
    marketIds: z.array(z.string().trim().min(1).max(64)).max(16).optional(),
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

export const updateLinkedDomainProjectBodySchema = z.object({
  projectId: z.string().trim().min(1).max(128).nullable(),
});
