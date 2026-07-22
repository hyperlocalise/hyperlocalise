/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { z } from "zod";

import { projectIdSchema } from "@/lib/projects/identity/project-id";
import { tmsAgentAutomationSettingsSchema } from "@/lib/providers/agent-runs/tms-agent-automation-settings";

export const tmsAgentAutomationScopeParamSchema = z.enum(["organization", "project", "provider"]);

export const projectAutomationParamsSchema = z.object({
  projectId: projectIdSchema,
});

export const providerAutomationParamsSchema = z.object({
  providerCredentialId: z.string().uuid(),
});

export const upsertTmsAgentAutomationSettingsBodySchema = z.object({
  settings: z.object({
    autoRunQaOnSyncedJobs: z.boolean().optional(),
    autoDraftTranslations: z
      .object({
        enabled: z.boolean().optional(),
        locales: z.array(z.string().trim().min(1).max(32)).optional(),
      })
      .optional(),
    writeBack: z
      .object({
        requireManualApproval: z.boolean().optional(),
        autoWriteBackEnabled: z.boolean().optional(),
      })
      .optional(),
  }),
});

export const tmsAgentAutomationSettingsResponseSchema = z.object({
  scope: tmsAgentAutomationScopeParamSchema,
  projectId: z.string().nullable(),
  providerCredentialId: z.string().uuid().nullable(),
  settings: tmsAgentAutomationSettingsSchema,
  stored: z
    .object({
      id: z.string().uuid(),
      updatedAt: z.string(),
    })
    .nullable(),
});
