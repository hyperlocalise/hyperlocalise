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

export const cdnDestinationParamsSchema = z.object({
  organizationSlug: z.string().min(1),
  destinationId: z.string().uuid(),
});

export const createCdnDestinationBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  bucket: z.string().trim().min(3).max(63),
  region: z.string().trim().min(1).max(32),
  endpoint: z.string().trim().url().nullable().optional(),
  publicBaseUrl: z.string().trim().url(),
  usePathStyle: z.boolean().optional(),
  accessKeyId: z.string().min(16).max(128),
  secretAccessKey: z.string().min(16).max(128),
  sessionToken: z.string().min(1).max(2048).nullable().optional(),
});

export const updateCdnDestinationBodySchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    bucket: z.string().trim().min(3).max(63).optional(),
    region: z.string().trim().min(1).max(32).optional(),
    endpoint: z.string().trim().url().nullable().optional(),
    publicBaseUrl: z.string().trim().url().optional(),
    usePathStyle: z.boolean().optional(),
    accessKeyId: z.string().min(16).max(128).optional(),
    secretAccessKey: z.string().min(16).max(128).optional(),
    sessionToken: z.string().min(1).max(2048).nullable().optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: "No fields to update",
  });
