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

export const gitlabConnectionIdParamSchema = z.object({
  connectionId: z.string().uuid(),
});

export const createGitLabConnectionBodySchema = z.object({
  displayName: z.string().trim().min(1).max(256),
  baseUrl: z.string().trim().url().max(2048),
  accessToken: z.string().trim().min(1).max(8192),
  enabled: z.boolean().optional(),
  validate: z.boolean().optional(),
});

export const updateGitLabConnectionBodySchema = z.object({
  displayName: z.string().trim().min(1).max(256).optional(),
  baseUrl: z.string().trim().url().max(2048).optional(),
  accessToken: z.string().trim().min(1).max(8192).optional(),
  enabled: z.boolean().optional(),
  validate: z.boolean().optional(),
});
