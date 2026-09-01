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

export const slackConnectInviteViewSchema = z.object({
  available: z.boolean(),
  invited: z.boolean(),
  dismissed: z.boolean(),
  lastInvitedAt: z.string().nullable(),
  invitedEmailMasked: z.string().nullable(),
});

export const slackConnectInviteEnvelopeSchema = z.object({
  slackConnect: slackConnectInviteViewSchema,
});

export const dismissSlackConnectBodySchema = z.object({
  dismissed: z.literal(true),
});
