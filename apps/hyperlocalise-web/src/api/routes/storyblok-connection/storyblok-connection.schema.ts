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

import { STORYBLOK_MAX_FOLDER_SLUGS, STORYBLOK_REGIONS } from "@/lib/storyblok/constants";

const regionSchema = z
  .enum(STORYBLOK_REGIONS as [string, ...string[]])
  .transform((value) => value as (typeof STORYBLOK_REGIONS)[number]);
const spaceIdSchema = z
  .string()
  .trim()
  .regex(/^\d{1,20}$/, "Storyblok space IDs are numeric");
const folderSlugsSchema = z
  .array(z.string().trim().min(1).max(512))
  .max(STORYBLOK_MAX_FOLDER_SLUGS);
const accessTokenSchema = z.string().trim().min(1).max(4096);

export const storyblokConnectionIdParamSchema = z.object({
  connectionId: z.string().uuid(),
});

export const createStoryblokConnectionBodySchema = z.object({
  displayName: z.string().trim().min(1).max(256),
  spaceId: spaceIdSchema,
  region: regionSchema,
  folderSlugs: folderSlugsSchema.default([]),
  accessToken: accessTokenSchema,
  enabled: z.boolean().default(true),
});

export const updateStoryblokConnectionBodySchema = z.object({
  displayName: z.string().trim().min(1).max(256).optional(),
  spaceId: spaceIdSchema.optional(),
  region: regionSchema.optional(),
  folderSlugs: folderSlugsSchema.optional(),
  accessToken: accessTokenSchema.optional(),
  enabled: z.boolean().optional(),
});

export const discoverStoryblokSpaceBodySchema = z
  .object({
    region: regionSchema.optional(),
    spaceId: spaceIdSchema.optional(),
    accessToken: accessTokenSchema.optional(),
    connectionId: z.string().uuid().optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.accessToken && !value.connectionId) {
      ctx.addIssue({
        code: "custom",
        message: "accessToken or connectionId is required",
        path: ["accessToken"],
      });
    }
  });
