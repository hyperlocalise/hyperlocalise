/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { z } from "zod";

export const mcpServerConnectionIdParamSchema = z.object({
  connectionId: z.string().uuid(),
});

const headerRecordSchema = z
  .record(z.string().trim().min(1).max(128), z.string().trim().min(1).max(4096))
  .optional();

export const createMcpServerConnectionBodySchema = z.object({
  displayName: z.string().trim().min(1).max(256),
  serverUrl: z.string().trim().url().max(2048),
  transport: z.enum(["http", "sse"]).default("http"),
  authKind: z.enum(["none", "bearer", "headers"]).default("none"),
  bearerToken: z.string().trim().min(1).max(8192).optional(),
  headers: headerRecordSchema,
  enabled: z.boolean().default(true),
});

export const updateMcpServerConnectionBodySchema = z.object({
  displayName: z.string().trim().min(1).max(256).optional(),
  serverUrl: z.string().trim().url().max(2048).optional(),
  transport: z.enum(["http", "sse"]).optional(),
  authKind: z.enum(["none", "bearer", "headers"]).optional(),
  bearerToken: z.string().trim().min(1).max(8192).optional(),
  headers: headerRecordSchema,
  enabled: z.boolean().optional(),
});
