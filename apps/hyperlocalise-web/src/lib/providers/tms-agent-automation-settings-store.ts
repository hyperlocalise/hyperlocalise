import { and, eq, isNull } from "drizzle-orm";

import { db, schema } from "@/lib/database";

import {
  DEFAULT_TMS_AGENT_AUTOMATION_SETTINGS,
  mergeTmsAgentAutomationSettings,
  normalizeStoredTmsAgentAutomationSettings,
  type TmsAgentAutomationScope,
  type TmsAgentAutomationSettings,
  type TmsAgentAutomationSettingsPartial,
  validateTmsAgentAutomationSettingsPatch,
} from "./tms-agent-automation-settings";

type ScopeRow = typeof schema.tmsAgentAutomationSettings.$inferSelect;

function scopeConditions(input: {
  organizationId: string;
  scope: TmsAgentAutomationScope;
  projectId?: string | null;
  providerCredentialId?: string | null;
}) {
  return and(
    eq(schema.tmsAgentAutomationSettings.organizationId, input.organizationId),
    eq(schema.tmsAgentAutomationSettings.scope, input.scope),
    input.projectId
      ? eq(schema.tmsAgentAutomationSettings.projectId, input.projectId)
      : isNull(schema.tmsAgentAutomationSettings.projectId),
    input.providerCredentialId
      ? eq(schema.tmsAgentAutomationSettings.providerCredentialId, input.providerCredentialId)
      : isNull(schema.tmsAgentAutomationSettings.providerCredentialId),
  );
}

async function getScopeRow(input: {
  organizationId: string;
  scope: TmsAgentAutomationScope;
  projectId?: string | null;
  providerCredentialId?: string | null;
}) {
  const [row] = await db
    .select()
    .from(schema.tmsAgentAutomationSettings)
    .where(scopeConditions(input))
    .limit(1);

  return row ?? null;
}

function rowToPartial(row: ScopeRow | null): TmsAgentAutomationSettingsPartial {
  if (!row) {
    return {};
  }

  return normalizeStoredTmsAgentAutomationSettings(row.settings);
}

export async function getTmsAgentAutomationSettingsForScope(input: {
  organizationId: string;
  scope: TmsAgentAutomationScope;
  projectId?: string | null;
  providerCredentialId?: string | null;
}) {
  const row = await getScopeRow(input);

  return {
    scope: input.scope,
    projectId: input.projectId ?? null,
    providerCredentialId: input.providerCredentialId ?? null,
    settings: mergeTmsAgentAutomationSettings(
      DEFAULT_TMS_AGENT_AUTOMATION_SETTINGS,
      rowToPartial(row),
    ),
    stored: row
      ? {
          id: row.id,
          updatedAt: row.updatedAt.toISOString(),
        }
      : null,
  };
}

export async function resolveEffectiveTmsAgentAutomationSettings(input: {
  organizationId: string;
  projectId?: string | null;
  providerCredentialId?: string | null;
}): Promise<TmsAgentAutomationSettings> {
  const [organizationRow, projectRow, providerRow] = await Promise.all([
    getScopeRow({ organizationId: input.organizationId, scope: "organization" }),
    input.projectId
      ? getScopeRow({
          organizationId: input.organizationId,
          scope: "project",
          projectId: input.projectId,
        })
      : Promise.resolve(null),
    input.providerCredentialId
      ? getScopeRow({
          organizationId: input.organizationId,
          scope: "provider",
          providerCredentialId: input.providerCredentialId,
        })
      : Promise.resolve(null),
  ]);

  return mergeTmsAgentAutomationSettings(
    mergeTmsAgentAutomationSettings(
      mergeTmsAgentAutomationSettings(
        DEFAULT_TMS_AGENT_AUTOMATION_SETTINGS,
        rowToPartial(organizationRow),
      ),
      rowToPartial(projectRow),
    ),
    rowToPartial(providerRow),
  );
}

export async function upsertTmsAgentAutomationSettingsForScope(input: {
  organizationId: string;
  scope: TmsAgentAutomationScope;
  projectId?: string | null;
  providerCredentialId?: string | null;
  settings: TmsAgentAutomationSettingsPartial;
}) {
  const validationError = validateTmsAgentAutomationSettingsPatch(input.settings);
  if (validationError) {
    throw new Error(validationError);
  }

  const existing = await getScopeRow(input);
  const mergedSettings = mergeTmsAgentAutomationSettings(
    mergeTmsAgentAutomationSettings(DEFAULT_TMS_AGENT_AUTOMATION_SETTINGS, rowToPartial(existing)),
    input.settings,
  );
  const validationErrorAfterMerge = validateTmsAgentAutomationSettingsPatch(mergedSettings);
  if (validationErrorAfterMerge) {
    throw new Error(validationErrorAfterMerge);
  }

  const storedSettings = parseStoredSettings(mergedSettings, DEFAULT_TMS_AGENT_AUTOMATION_SETTINGS);
  const scopeValues = {
    organizationId: input.organizationId,
    scope: input.scope,
    projectId: input.scope === "project" ? input.projectId! : null,
    providerCredentialId: input.scope === "provider" ? input.providerCredentialId! : null,
  };

  await db
    .insert(schema.tmsAgentAutomationSettings)
    .values({
      ...scopeValues,
      settings: storedSettings,
    })
    .onConflictDoUpdate({
      target: [
        schema.tmsAgentAutomationSettings.organizationId,
        schema.tmsAgentAutomationSettings.scope,
        schema.tmsAgentAutomationSettings.projectId,
        schema.tmsAgentAutomationSettings.providerCredentialId,
      ],
      set: {
        settings: storedSettings,
        updatedAt: new Date(),
      },
    });

  return getTmsAgentAutomationSettingsForScope(input);
}

function parseStoredSettings(
  merged: TmsAgentAutomationSettings,
  defaults: TmsAgentAutomationSettings,
): Record<string, unknown> {
  const stored: Record<string, unknown> = {};

  if (merged.autoRunQaOnSyncedJobs !== defaults.autoRunQaOnSyncedJobs) {
    stored.autoRunQaOnSyncedJobs = merged.autoRunQaOnSyncedJobs;
  }

  if (
    merged.autoDraftTranslations.enabled !== defaults.autoDraftTranslations.enabled ||
    merged.autoDraftTranslations.locales.length > 0
  ) {
    stored.autoDraftTranslations = merged.autoDraftTranslations;
  }

  if (
    merged.writeBack.requireManualApproval !== defaults.writeBack.requireManualApproval ||
    merged.writeBack.autoWriteBackEnabled !== defaults.writeBack.autoWriteBackEnabled
  ) {
    stored.writeBack = merged.writeBack;
  }

  return stored;
}

export async function deleteTmsAgentAutomationSettingsForScope(input: {
  organizationId: string;
  scope: TmsAgentAutomationScope;
  projectId?: string | null;
  providerCredentialId?: string | null;
}) {
  await db.delete(schema.tmsAgentAutomationSettings).where(scopeConditions(input));

  return getTmsAgentAutomationSettingsForScope(input);
}
