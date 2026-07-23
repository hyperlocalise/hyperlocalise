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

export const semrushConnectionIdParamSchema = z.object({
  connectionId: z.string().uuid(),
});

export const createSemrushConnectionBodySchema = z.object({
  displayName: z.string().trim().min(1).max(256),
  apiKey: z.string().trim().min(1).max(8192),
  enabled: z.boolean().optional(),
  /** When true, opens Semrush MCP to confirm the key before saving. */
  validate: z.boolean().optional(),
});

export const updateSemrushConnectionBodySchema = z.object({
  displayName: z.string().trim().min(1).max(256).optional(),
  apiKey: z.string().trim().min(1).max(8192).optional(),
  enabled: z.boolean().optional(),
  validate: z.boolean().optional(),
});
