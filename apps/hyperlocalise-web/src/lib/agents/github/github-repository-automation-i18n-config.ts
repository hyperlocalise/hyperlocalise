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
import { normalizeJsonc } from "@/lib/i18n/parse-jsonc-config";
import { prepareSandbox, runSandboxCommand } from "@/lib/translation/sandbox";
import { isErr } from "@/lib/primitives/result/results";
import { safeJsonParse } from "@/lib/primitives/safeJsonParse/safeJsonParse";
import { shellQuote } from "@/lib/primitives/shell-quote/shell-quote";

import {
  extractI18nBucketFilePatternsFromConfigJson,
  extractI18nBucketFilePatternsFromConfigText,
  type I18nBucketFilePatterns,
} from "./github-repository-automation-localisation-paths";

export type DiscoveredI18nConfig = {
  configPath: string;
  patterns: I18nBucketFilePatterns;
};

const CONFIG_CANDIDATES = ["i18n.yml", "i18n.jsonc"] as const;

function compareConfigPathDepth(left: string, right: string): number {
  const leftDepth = left.split("/").length;
  const rightDepth = right.split("/").length;
  if (leftDepth !== rightDepth) {
    return leftDepth - rightDepth;
  }
  return left.localeCompare(right);
}

function rankConfigPath(path: string): number {
  if (path.endsWith("i18n.yml")) {
    return 0;
  }
  if (path.endsWith("i18n.jsonc")) {
    return 1;
  }
  return 2;
}

async function listTrackedI18nConfigPaths(sandboxId: string): Promise<string[]> {
  const listed = await runSandboxCommand(sandboxId, "bash", [
    "-lc",
    "git ls-files -z -- i18n.yml i18n.jsonc ':(glob)**/i18n.yml' ':(glob)**/i18n.jsonc'",
  ]);
  if (listed.exitCode !== 0 || listed.output.length === 0) {
    return [...CONFIG_CANDIDATES];
  }

  const paths = listed.output
    .split("\0")
    .map((entry) => entry.trim())
    .filter((entry) => entry.endsWith("i18n.yml") || entry.endsWith("i18n.jsonc"));

  if (paths.length === 0) {
    return [...CONFIG_CANDIDATES];
  }

  return [...paths].sort((left, right) => {
    const leftRank = rankConfigPath(left);
    const rightRank = rankConfigPath(right);
    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }
    return compareConfigPathDepth(left, right);
  });
}

async function loadDiscoveredI18nConfig(
  sandboxId: string,
  configPath: string,
): Promise<DiscoveredI18nConfig | null> {
  const configText = await readConfigTextFromSandbox(sandboxId, configPath);
  if (!configText) {
    return null;
  }

  if (configPath.endsWith(".yml") || configPath.endsWith(".yaml")) {
    const parsed = safeJsonParse(configText);
    if (isErr(parsed)) {
      return null;
    }
    return {
      configPath,
      patterns: extractI18nBucketFilePatternsFromConfigJson(
        parsed.value as Record<string, unknown>,
      ),
    };
  }

  const patterns = extractI18nBucketFilePatternsFromConfigText(configText, configPath);
  if (!patterns) {
    return null;
  }

  return { configPath, patterns };
}

async function readConfigTextFromSandbox(
  sandboxId: string,
  configPath: string,
): Promise<string | null> {
  if (configPath.endsWith(".yml") || configPath.endsWith(".yaml")) {
    const yq = await runSandboxCommand(sandboxId, "bash", [
      "-lc",
      `command -v yq >/dev/null 2>&1 && yq -o json . ${shellQuote(configPath)}`,
    ]);
    if (yq.exitCode === 0 && yq.output.trim().length > 0) {
      return yq.output;
    }
    return null;
  }

  const cat = await runSandboxCommand(sandboxId, "cat", [configPath], { output: "stdout" });
  if (cat.exitCode !== 0) {
    return null;
  }

  return cat.output;
}

export async function discoverI18nConfigInSandbox(
  sandboxId: string,
): Promise<DiscoveredI18nConfig | null> {
  await prepareSandbox(sandboxId);

  const candidates = await listTrackedI18nConfigPaths(sandboxId);
  for (const candidate of candidates) {
    const exists = await runSandboxCommand(sandboxId, "test", ["-f", candidate]);
    if (exists.exitCode !== 0) {
      continue;
    }

    const discovered = await loadDiscoveredI18nConfig(sandboxId, candidate);
    if (discovered) {
      return discovered;
    }
  }

  return null;
}

export async function loadI18nConfigJsonFromSandbox(
  sandboxId: string,
  configPath: string,
): Promise<Record<string, unknown> | null> {
  const configText = await readConfigTextFromSandbox(sandboxId, configPath);
  if (!configText) {
    return null;
  }

  if (configPath.endsWith(".jsonc")) {
    const parsed = safeJsonParse(normalizeJsonc(configText));
    if (isErr(parsed)) {
      return null;
    }
    return parsed.value as Record<string, unknown>;
  }

  const parsed = safeJsonParse(configText);
  if (isErr(parsed)) {
    return null;
  }

  return parsed.value as Record<string, unknown>;
}
