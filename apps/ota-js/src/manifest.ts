import { OtaError } from "./errors";

export const SUPPORTED_SCHEMA_VERSION = 1;

export type OtaFormat = "json" | "android-xml" | "ios-strings";

export interface OtaManifest {
  schema_version: number;
  format: OtaFormat;
  files: string[];
  languages: string[];
  language_mapping: Record<string, string>;
  /** Unix seconds of the release. Changes on every release. */
  timestamp: number;
  content: Record<string, string[]>;
}

/** Flat key to translated text, as written by the `json` format. */
export type OtaMessages = Record<string, string>;

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseManifest(value: unknown, url?: string): OtaManifest {
  const fail = (reason: string): never => {
    throw new OtaError("invalid_manifest", `Invalid OTA manifest: ${reason}`, { url });
  };

  if (!isRecord(value)) {
    return fail("expected a JSON object");
  }
  if (value.schema_version !== SUPPORTED_SCHEMA_VERSION) {
    return fail(`unsupported schema_version ${String(value.schema_version)}`);
  }
  if (value.format !== "json" && value.format !== "android-xml" && value.format !== "ios-strings") {
    return fail(`unknown format ${String(value.format)}`);
  }
  if (typeof value.timestamp !== "number" || !Number.isFinite(value.timestamp)) {
    return fail("timestamp must be a number");
  }
  if (!isStringArray(value.languages)) {
    return fail("languages must be a list of locales");
  }
  const files = isStringArray(value.files) ? value.files : [];

  const languageMapping: Record<string, string> = {};
  if (isRecord(value.language_mapping)) {
    for (const [from, to] of Object.entries(value.language_mapping)) {
      if (typeof to === "string") {
        languageMapping[from] = to;
      }
    }
  }

  if (!isRecord(value.content)) {
    return fail("content must map locales to paths");
  }
  const content: Record<string, string[]> = {};
  for (const [locale, paths] of Object.entries(value.content)) {
    if (!isStringArray(paths)) {
      return fail(`content.${locale} must be a list of paths`);
    }
    content[locale] = paths;
  }

  return {
    schema_version: value.schema_version,
    format: value.format,
    files,
    languages: value.languages,
    language_mapping: languageMapping,
    timestamp: value.timestamp,
    content,
  };
}

export function parseJsonMessages(value: unknown, url?: string): OtaMessages {
  if (!isRecord(value)) {
    throw new OtaError("invalid_content", "OTA content must be a JSON object", { url });
  }
  const messages: OtaMessages = {};
  for (const [key, text] of Object.entries(value)) {
    if (typeof text === "string") {
      messages[key] = text;
    }
  }
  return messages;
}

/** `/content/fr-FR/messages.json` → `messages`. */
export function namespaceFromPath(path: string): string {
  const base = path.split("/").pop() ?? path;
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(0, dot) : base;
}
