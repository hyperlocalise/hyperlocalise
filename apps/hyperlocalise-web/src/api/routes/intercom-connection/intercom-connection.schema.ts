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

import { INTERCOM_REST_ENDPOINTS } from "@/lib/intercom/constants";

export const intercomConnectionIdParamSchema = z.object({
  connectionId: z.string().uuid(),
});

export const createIntercomConnectionBodySchema = z.object({
  displayName: z.string().trim().min(1).max(256),
  accessToken: z.string().trim().min(1).max(8192),
  restEndpoint: z.enum(INTERCOM_REST_ENDPOINTS),
  enabled: z.boolean().optional(),
  /** When true, calls Intercom /me to confirm the token before saving. */
  validate: z.boolean().optional(),
});

export const updateIntercomConnectionBodySchema = z.object({
  displayName: z.string().trim().min(1).max(256).optional(),
  accessToken: z.string().trim().min(1).max(8192).optional(),
  restEndpoint: z.enum(INTERCOM_REST_ENDPOINTS).optional(),
  enabled: z.boolean().optional(),
  validate: z.boolean().optional(),
});
