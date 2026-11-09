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

export const webflowConnectionIdParamSchema = z.object({
  connectionId: z.string().uuid(),
});

export const createWebflowConnectionBodySchema = z.object({
  displayName: z.string().trim().min(1).max(256),
  siteId: z.string().trim().min(1).max(128),
  collectionIds: z.array(z.string().trim().min(1).max(128)).max(50).default([]),
  siteToken: z.string().trim().min(1).max(4096),
  enabled: z.boolean().default(true),
});

export const updateWebflowConnectionBodySchema = z.object({
  displayName: z.string().trim().min(1).max(256).optional(),
  siteId: z.string().trim().min(1).max(128).optional(),
  collectionIds: z.array(z.string().trim().min(1).max(128)).max(50).optional(),
  siteToken: z.string().trim().min(1).max(4096).optional(),
  enabled: z.boolean().optional(),
});

export const discoverWebflowSiteBodySchema = z
  .object({
    siteId: z.string().trim().min(1).max(128).optional(),
    siteToken: z.string().trim().min(1).max(4096).optional(),
    connectionId: z.string().uuid().optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.siteToken && !value.connectionId) {
      ctx.addIssue({
        code: "custom",
        message: "siteToken or connectionId is required",
        path: ["siteToken"],
      });
    }
  });
