import { mkdir, writeFile } from "node:fs/promises";
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

export type MaterializedHlCheckWorkspace = {
  rootDir: string;
  configPath: string;
  sourceLocale: string;
  targetLocales: string[];
  keyManifest: HlCheckKeyManifest;
};

const STRINGS_FILE = "strings.json";

function uniqueCheckKey(unit: ExternalTmsTranslationUnit, usedKeys: Set<string>): string {
  const base = unit.key.trim() || unit.externalStringId;
  if (!usedKeys.has(base)) {
    usedKeys.add(base);
    return base;
  }

  const unique = `${base}__${unit.externalStringId}`;
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

function writeCheckConfig(
  configPath: string,
  sourcePath: string,
  targetPathTemplate: string,
  sourceLocale: string,
  targetLocales: string[],
) {
  const quotedLocales = targetLocales.map((locale) => JSON.stringify(locale));
  const content = `{
  "locales": {"source":${JSON.stringify(sourceLocale)},"targets":[${quotedLocales.join(",")}]},
  "buckets": {"provider":{"files":[{"from":${JSON.stringify(sourcePath)},"to":${JSON.stringify(targetPathTemplate)}}]}},
  "groups": {"default":{"targets":[${quotedLocales.join(",")}],"buckets":["provider"]}},
  "llm": {"profiles":{"default":{"provider":"openai","model":"gpt-4.1-mini","prompt":"Translate {{input}}"}}}
}`;
  return writeFile(configPath, content, "utf8");
}

export async function materializeHlCheckWorkspace(
  content: ExternalTmsTaskContent,
  rootDir: string,
  targetLocales: string[],
): Promise<MaterializedHlCheckWorkspace> {
  const sourceLocale = content.sourceLocale?.trim() || "en";
  const sourceRelative = path.join("content", sourceLocale, STRINGS_FILE);
  const targetTemplate = path.join("content", "{{target}}", STRINGS_FILE).replaceAll("\\", "/");
  const sourcePath = path.join(rootDir, sourceRelative);
  const configPath = path.join(rootDir, "i18n.jsonc");

  const sourceBundle = buildJsonMap(content.units, (unit) => unit.sourceText ?? "");
  await mkdir(path.dirname(sourcePath), { recursive: true });
  await writeFile(sourcePath, `${JSON.stringify(sourceBundle.payload, null, 2)}\n`, "utf8");

  for (const locale of targetLocales) {
    const targetPath = path.join(rootDir, "content", locale, STRINGS_FILE);
    const targetBundle = buildJsonMap(content.units, (unit) => {
      const match = unit.translations.find((translation) => translation.locale === locale);
      return match?.text ?? "";
    });
    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, `${JSON.stringify(targetBundle.payload, null, 2)}\n`, "utf8");
  }

  await writeCheckConfig(
    configPath,
    sourceRelative.replaceAll("\\", "/"),
    targetTemplate,
    sourceLocale,
    targetLocales,
  );

  return {
    rootDir,
    configPath,
    sourceLocale,
    targetLocales,
    keyManifest: sourceBundle.manifest,
  };
}
