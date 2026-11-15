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

export const otaDistributionFormatSchema = z.enum(["json", "android_xml", "ios_strings"]);

export const otaDistributionProjectParamsSchema = z.object({
  organizationSlug: z.string().min(1),
  projectId: z.string().min(1),
});

export const otaDistributionParamsSchema = otaDistributionProjectParamsSchema.extend({
  distributionId: z.string().uuid(),
});

export const createOtaDistributionBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  fileIds: z.array(z.string().uuid()).min(1),
  locales: z.array(z.string().min(1)).min(1),
  format: otaDistributionFormatSchema,
  branchName: z.string().trim().min(1).max(128).optional(),
  destinationId: z.string().uuid().nullable().optional(),
});

export const updateOtaDistributionBodySchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    fileIds: z.array(z.string().uuid()).min(1).optional(),
    locales: z.array(z.string().min(1)).min(1).optional(),
    format: otaDistributionFormatSchema.optional(),
    destinationId: z.string().uuid().nullable().optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.fileIds !== undefined ||
      value.locales !== undefined ||
      value.format !== undefined ||
      value.destinationId !== undefined,
    { message: "No fields to update" },
  );
