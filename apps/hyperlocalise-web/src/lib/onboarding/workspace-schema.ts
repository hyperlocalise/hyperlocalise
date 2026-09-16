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

import { isAllowedWorkspaceIdentity } from "@/lib/workspace/workspace-identity-policy";

export const WORKSPACE_IDENTITY_BLOCKED_MESSAGE =
  "Choose a workspace name without profanity or reserved words";

export const createWorkspaceSchema = z.object({
  organizationName: z
    .string()
    .trim()
    .min(2)
    .refine(isAllowedWorkspaceIdentity, WORKSPACE_IDENTITY_BLOCKED_MESSAGE),
});
