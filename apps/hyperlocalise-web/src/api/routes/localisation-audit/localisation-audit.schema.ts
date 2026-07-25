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

export const startLocalisationAuditBodySchema = z.object({
  url: z.string().trim().min(1).max(2_048),
  focusLocales: z.array(z.string().trim().min(2).max(16)).max(2).optional(),
});

export const unlockLocalisationAuditBodySchema = z.object({
  email: z.string().trim().email().max(320),
  locale: z.string().trim().min(2).max(16).optional(),
});
