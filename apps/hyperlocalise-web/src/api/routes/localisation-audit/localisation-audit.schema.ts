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

export const localisationAuditIdParamSchema = z.object({
  auditId: z.uuid(),
});

export const localisationAuditReportSlugParamSchema = z.object({
  slug: z
    .string()
    .min(16)
    .max(64)
    .regex(/^[A-Za-z0-9_-]+$/),
});

export const createLocalisationAuditBodySchema = z.object({
  url: z.string().trim().min(1).max(2_048),
});

export const confirmLocalisationAuditBodySchema = z.object({
  targetLocale: z
    .string()
    .trim()
    .min(2)
    .max(35)
    .refine((value) => {
      try {
        return Intl.getCanonicalLocales(value).length === 1;
      } catch {
        return false;
      }
    }, "Target locale must be a valid BCP 47 locale."),
  targetMarket: z
    .string()
    .trim()
    .length(2)
    .regex(/^[A-Za-z]{2}$/)
    .transform((value) => value.toUpperCase()),
});

export const unlockLocalisationAuditBodySchema = z.object({
  email: z.email().max(320),
  name: z.string().trim().min(1).max(100).optional(),
});
