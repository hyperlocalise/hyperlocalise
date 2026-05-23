import path from "node:path";

import type {
  ExternalTmsTaskContent,
  ExternalTmsTranslationUnit,
} from "@/lib/providers/external-tms-content-sync";

export type HlCheckKeyManifestEntry = {
  externalStringId: string;
  key: string;
};

export type HlCheckKeyManifest = Record<string, HlCheckKeyManifestEntry>;

export type HlCheckWorkspaceFile = {
  path: string;
  content: string;
};

export type HlCheckWorkspaceBundle = {
  workspaceRoot: string;
  configPath: string;
  reportPath: string;
  sourceLocale: string;
  targetLocales: string[];
  keyManifest: HlCheckKeyManifest;
  files: HlCheckWorkspaceFile[];
};

export type MaterializedHlCheckWorkspace = {
  rootDir: string;
  configPath: string;
  sourceLocale: string;
  targetLocales: string[];
  keyManifest: HlCheckKeyManifest;
};

const STRINGS_FILE = "strings.json";
const WORKSPACE_ROOT = "/tmp/hl-provider-qa";

function uniqueCheckKey(unit: ExternalTmsTranslationUnit, usedKeys: Set<string>): string {
  const base = unit.key.trim() || unit.externalStringId;
  if (!usedKeys.has(base)) {
    usedKeys.add(base);
    return base;
  }

  let unique = `${base}__${unit.externalStringId}`;
  let suffix = 2;
  while (usedKeys.has(unique)) {
    unique = `${base}__${unit.externalStringId}__${suffix++}`;
  }
  usedKeys.add(unique);
  return unique;
}

function buildJsonMap(
  units: ExternalTmsTranslationUnit[],
  readValue: (unit: ExternalTmsTranslationUnit) => string,
): { payload: Record<string, string>; manifest: HlCheckKeyManifest } {
  const usedKeys = new Set<string>();
  const payload: Record<string, string> = {};
  const manifest: HlCheckKeyManifest = {};

  for (const unit of units) {
    const checkKey = uniqueCheckKey(unit, usedKeys);
    payload[checkKey] = readValue(unit);
    manifest[checkKey] = {
      externalStringId: unit.externalStringId,
      key: unit.key,
    };
  }

  return { payload, manifest };
}

function buildCheckConfigContent(
  sourcePath: string,
  targetPathTemplate: string,
  sourceLocale: string,
  targetLocales: string[],
) {
  const quotedLocales = targetLocales.map((locale) => JSON.stringify(locale));
  return `{
  "locales": {"source":${JSON.stringify(sourceLocale)},"targets":[${quotedLocales.join(",")}]},
  "buckets": {"provider":{"files":[{"from":${JSON.stringify(sourcePath)},"to":${JSON.stringify(targetPathTemplate)}}]}},
  "groups": {"default":{"targets":[${quotedLocales.join(",")}],"buckets":["provider"]}},
  "llm": {"profiles":{"default":{"provider":"openai","model":"gpt-4.1-mini","prompt":"Translate {{input}}"}}}
}`;
}

export function buildHlCheckWorkspaceBundle(
  content: ExternalTmsTaskContent,
  targetLocales: string[],
  workspaceRoot = WORKSPACE_ROOT,
): HlCheckWorkspaceBundle {
  const sourceLocale = content.sourceLocale?.trim() || "en";
  const sourceRelative = path.join("content", sourceLocale, STRINGS_FILE).replaceAll("\\", "/");
  const targetTemplate = path.join("content", "{{target}}", STRINGS_FILE).replaceAll("\\", "/");
  const configPath = path.join(workspaceRoot, "i18n.jsonc").replaceAll("\\", "/");
  const reportPath = path.join(workspaceRoot, "report.json").replaceAll("\\", "/");

  const sourceBundle = buildJsonMap(content.units, (unit) => unit.sourceText ?? "");
  const files: HlCheckWorkspaceFile[] = [
    {
      path: path.join(workspaceRoot, sourceRelative).replaceAll("\\", "/"),
      content: `${JSON.stringify(sourceBundle.payload, null, 2)}\n`,
    },
    {
      path: configPath,
      content: buildCheckConfigContent(sourceRelative, targetTemplate, sourceLocale, targetLocales),
    },
  ];

  for (const locale of targetLocales) {
    const targetRelative = path.join("content", locale, STRINGS_FILE).replaceAll("\\", "/");
    const targetBundle = buildJsonMap(content.units, (unit) => {
      const match = unit.translations.find((translation) => translation.locale === locale);
      return match?.text ?? "";
    });
    files.push({
      path: path.join(workspaceRoot, targetRelative).replaceAll("\\", "/"),
      content: `${JSON.stringify(targetBundle.payload, null, 2)}\n`,
    });
  }

  return {
    workspaceRoot,
    configPath,
    reportPath,
    sourceLocale,
    targetLocales,
    keyManifest: sourceBundle.manifest,
    files,
  };
}
