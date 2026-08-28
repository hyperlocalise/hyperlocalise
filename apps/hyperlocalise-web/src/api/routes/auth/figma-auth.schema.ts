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

export const figmaAuthorizeQuerySchema = z.object({
  codeChallenge: z.string().min(43).max(128),
  codeChallengeMethod: z.literal("S256").default("S256"),
  state: z.string().min(8).max(256).optional(),
  screenHint: z.enum(["sign-in", "sign-up"]).optional(),
});

export const figmaTokenBodySchema = z.object({
  code: z.string().min(1).max(512),
  codeVerifier: z.string().min(43).max(128),
});

export type FigmaAuthorizeQuery = z.infer<typeof figmaAuthorizeQuerySchema>;
export type FigmaTokenBody = z.infer<typeof figmaTokenBodySchema>;
