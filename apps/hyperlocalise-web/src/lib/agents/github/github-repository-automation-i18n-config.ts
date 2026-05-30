import { normalizeJsonc } from "@/lib/i18n/parse-jsonc-config";
import { prepareSandbox, runSandboxCommand } from "@/lib/translation/sandbox-translation";
import { isErr } from "@/lib/primitives/result/results";
import { safeJsonParse } from "@/lib/primitives/safeJsonParse/safeJsonParse";

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

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
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

  for (const candidate of CONFIG_CANDIDATES) {
    const exists = await runSandboxCommand(sandboxId, "test", ["-f", candidate]);
    if (exists.exitCode !== 0) {
      continue;
    }

    const configText = await readConfigTextFromSandbox(sandboxId, candidate);
    if (!configText) {
      continue;
    }

    if (candidate.endsWith(".yml") || candidate.endsWith(".yaml")) {
      const parsed = safeJsonParse(configText);
      if (isErr(parsed)) {
        continue;
      }
      return {
        configPath: candidate,
        patterns: extractI18nBucketFilePatternsFromConfigJson(
          parsed.value as Record<string, unknown>,
        ),
      };
    }

    const patterns = extractI18nBucketFilePatternsFromConfigText(configText, candidate);
    if (!patterns) {
      continue;
    }

    return { configPath: candidate, patterns };
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
