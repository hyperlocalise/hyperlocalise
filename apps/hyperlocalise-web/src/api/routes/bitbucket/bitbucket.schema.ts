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

export const saveBitbucketConnectionBodySchema = z.object({
  name: z.string().trim().max(80).optional(),
  /** The Atlassian account email an API token is sent with; empty for an access token. */
  accountEmail: z.string().trim().max(320).optional(),
  accessToken: z.string().min(1).max(8192),
});

export const bitbucketConnectionParamsSchema = z.object({
  connectionId: z.string().uuid(),
});
