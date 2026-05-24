import { z } from "zod";

export const tmsAgentAutomationScopeSchema = z.enum(["organization", "project", "provider"]);
export type TmsAgentAutomationScope = z.infer<typeof tmsAgentAutomationScopeSchema>;

export const tmsAgentAutomationSettingsSchema = z.object({
  autoRunQaOnSyncedJobs: z.boolean().default(false),
  autoDraftTranslations: z
    .object({
      enabled: z.boolean().default(false),
      locales: z.array(z.string()).default([]),
    })
    .default({ enabled: false, locales: [] }),
  writeBack: z
    .object({
      requireManualApproval: z.boolean().default(true),
      autoWriteBackEnabled: z.boolean().default(false),
    })
    .default({ requireManualApproval: true, autoWriteBackEnabled: false }),
});

export type TmsAgentAutomationSettings = z.infer<typeof tmsAgentAutomationSettingsSchema>;

export const DEFAULT_TMS_AGENT_AUTOMATION_SETTINGS: TmsAgentAutomationSettings =
  tmsAgentAutomationSettingsSchema.parse({});

const tmsAgentAutomationSettingsPartialSchema = z.object({
  autoRunQaOnSyncedJobs: z.boolean().optional(),
  autoDraftTranslations: z
    .object({
      enabled: z.boolean().optional(),
      locales: z.array(z.string()).optional(),
    })
    .optional(),
  writeBack: z
    .object({
      requireManualApproval: z.boolean().optional(),
      autoWriteBackEnabled: z.boolean().optional(),
    })
    .optional(),
});

export type TmsAgentAutomationSettingsPartial = z.infer<
  typeof tmsAgentAutomationSettingsPartialSchema
>;

export function mergeTmsAgentAutomationSettings(
  base: TmsAgentAutomationSettings,
  override?: TmsAgentAutomationSettingsPartial | null,
): TmsAgentAutomationSettings {
  if (!override) {
    return base;
  }

  return tmsAgentAutomationSettingsSchema.parse({
    autoRunQaOnSyncedJobs: override.autoRunQaOnSyncedJobs ?? base.autoRunQaOnSyncedJobs,
    autoDraftTranslations: {
      enabled: override.autoDraftTranslations?.enabled ?? base.autoDraftTranslations.enabled,
      locales: override.autoDraftTranslations?.locales ?? base.autoDraftTranslations.locales,
    },
    writeBack: {
      requireManualApproval:
        override.writeBack?.requireManualApproval ?? base.writeBack.requireManualApproval,
      autoWriteBackEnabled:
        override.writeBack?.autoWriteBackEnabled ?? base.writeBack.autoWriteBackEnabled,
    },
  });
}

export function parseTmsAgentAutomationSettingsPartial(
  value: unknown,
): TmsAgentAutomationSettingsPartial {
  return tmsAgentAutomationSettingsPartialSchema.parse(value);
}

export function normalizeStoredTmsAgentAutomationSettings(
  value: Record<string, unknown> | null | undefined,
): TmsAgentAutomationSettingsPartial {
  if (!value || Object.keys(value).length === 0) {
    return {};
  }

  return parseTmsAgentAutomationSettingsPartial(value);
}

export function shouldAutoRunQaOnSyncedJob(settings: TmsAgentAutomationSettings) {
  return settings.autoRunQaOnSyncedJobs;
}

export function shouldAutoDraftTranslationForLocale(
  settings: TmsAgentAutomationSettings,
  locale: string,
) {
  if (!settings.autoDraftTranslations.enabled) {
    return false;
  }

  const locales = settings.autoDraftTranslations.locales;
  if (locales.length === 0) {
    return false;
  }

  return locales.includes(locale);
}

export function requiresManualWriteBackApproval(settings: TmsAgentAutomationSettings) {
  return settings.writeBack.requireManualApproval;
}

export function isAutoWriteBackEnabled(settings: TmsAgentAutomationSettings) {
  return settings.writeBack.autoWriteBackEnabled;
}

export function canAutoEnqueueProviderWriteBack(settings: TmsAgentAutomationSettings) {
  return isAutoWriteBackEnabled(settings);
}

export function validateTmsAgentAutomationSettingsPatch(
  patch: TmsAgentAutomationSettingsPartial | TmsAgentAutomationSettings,
): string | null {
  if (
    patch.writeBack?.autoWriteBackEnabled === true &&
    patch.writeBack.requireManualApproval === false
  ) {
    return "auto_write_back_requires_manual_approval";
  }

  if (patch.autoDraftTranslations?.enabled === true) {
    const locales = patch.autoDraftTranslations.locales;
    if (locales !== undefined && locales.length === 0) {
      return "auto_draft_requires_locales";
    }
  }

  return null;
}
