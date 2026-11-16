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

export type TilionApiKeyKind = "ph_live" | "ph_test" | "other" | "missing";
export type TilionApiKeySource = "process.env" | "t3-env" | "missing";

export type TilionApiKeyResolution = {
  apiKey: string | undefined;
  processTilionApiKeyPresent: boolean;
  t3EnvTilionApiKeyPresent: boolean;
  tilionApiKeyKind: TilionApiKeyKind;
  tilionApiKeySource: TilionApiKeySource;
  tilionApiKeySourcesAgree: boolean;
};

function trimKey(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function tilionApiKeyKind(value: string | undefined): TilionApiKeyKind {
  const key = trimKey(value);
  if (!key) return "missing";
  if (key.startsWith("ph_live_")) return "ph_live";
  if (key.startsWith("ph_test_")) return "ph_test";
  return "other";
}

/**
 * Workflow steps should prefer `process.env` over t3-env: the Workflow DevKit
 * snapshot of `process.env` is the runtime value, while `@/lib/env` can miss a
 * key that was added after the last bundle.
 */
export function resolveTilionApiKey(input?: {
  processValue?: string;
  t3EnvValue?: string;
}): TilionApiKeyResolution {
  const processKey = trimKey(input?.processValue ?? process.env.TILION_API_KEY);
  const t3EnvKey = trimKey(input?.t3EnvValue);
  const apiKey = processKey ?? t3EnvKey;
  return {
    apiKey,
    processTilionApiKeyPresent: Boolean(processKey),
    t3EnvTilionApiKeyPresent: Boolean(t3EnvKey),
    tilionApiKeyKind: tilionApiKeyKind(apiKey),
    tilionApiKeySource: processKey ? "process.env" : t3EnvKey ? "t3-env" : "missing",
    tilionApiKeySourcesAgree: Boolean(processKey) === Boolean(t3EnvKey),
  };
}

export function tilionApiKeyLogFields(resolution: TilionApiKeyResolution) {
  return {
    processTilionApiKeyPresent: resolution.processTilionApiKeyPresent,
    t3EnvTilionApiKeyPresent: resolution.t3EnvTilionApiKeyPresent,
    tilionApiKeyKind: resolution.tilionApiKeyKind,
    tilionApiKeySource: resolution.tilionApiKeySource,
    tilionApiKeySourcesAgree: resolution.tilionApiKeySourcesAgree,
  };
}
