import { z } from "zod";

import { tmsAgentAutomationSettingsSchema } from "@/lib/providers/tms-agent-automation-settings";

export const tmsAgentAutomationScopeParamSchema = z.enum(["organization", "project", "provider"]);

export const projectAutomationParamsSchema = z.object({
  projectId: z.string().min(1),
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
        locales: z.array(z.string().max(32)).optional(),
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
