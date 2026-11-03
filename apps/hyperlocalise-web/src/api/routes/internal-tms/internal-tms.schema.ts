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

import { externalTmsProviderKindSchema } from "@/api/routes/external-tms-provider-credential/external-tms-provider-credential.schema";
import { successEnvelopeSchema } from "@/api/response.schema";

export const mintExternalTmsAccessTokenBodySchema = z.object({
  organizationId: z.uuid(),
  providerKind: externalTmsProviderKindSchema,
  credentialId: z.uuid().optional(),
  actorUserId: z.uuid().optional(),
});

export const externalTmsAccessTokenSchema = z.object({
  providerKind: externalTmsProviderKindSchema,
  credentialId: z.uuid(),
  authMode: z.string().min(1),
  baseUrl: z.url(),
  headerName: z.string().min(1),
  headerValue: z.string().min(1),
  expiresAt: z.string().datetime().nullable(),
  probeUrl: z.url().nullable(),
});

export const mintExternalTmsAccessTokenResponseSchema = successEnvelopeSchema(
  "tmsAccessToken",
  externalTmsAccessTokenSchema,
);

export type MintExternalTmsAccessTokenBody = z.infer<typeof mintExternalTmsAccessTokenBodySchema>;
