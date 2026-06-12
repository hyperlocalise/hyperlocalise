import type { ProjectSourceStringEntry } from "@/api/routes/project/project.schema";
import { normalizeJsonc } from "@/lib/i18n/parse-jsonc-config";
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";
import { safeJsonParse } from "@/lib/primitives/safeJsonParse/safeJsonParse";

export type ParseTranslationFileEntriesError =
  | { code: "invalid_json" }
  | { code: "invalid_catalog_shape" };

function formatLeafValue(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }

  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return null;
}

function flattenJsonObject(output: Map<string, string>, prefix: string, value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      const nextPrefix = prefix ? `${prefix}[${index}]` : `[${index}]`;
      flattenJsonObject(output, nextPrefix, item);
    });
    return;
  }

  if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      const nextPrefix = prefix ? `${prefix}.${key}` : key;
      flattenJsonObject(output, nextPrefix, nested);
    }
    return;
  }

  const leaf = formatLeafValue(value);
  if (leaf === null || !prefix) {
    return;
  }

  output.set(prefix, leaf);
}

function parseFormatJsMessage(value: unknown): { text: string; context?: string } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const message = value as Record<string, unknown>;
  const defaultMessage = message.defaultMessage;
  if (typeof defaultMessage !== "string") {
    return null;
  }

  const description = typeof message.description === "string" ? message.description : undefined;
  return { text: defaultMessage, context: description };
}

function parseTopLevelEntries(payload: Record<string, unknown>): ProjectSourceStringEntry[] {
  const entries: ProjectSourceStringEntry[] = [];

  for (const [key, value] of Object.entries(payload)) {
    const formatJs = parseFormatJsMessage(value);
    if (formatJs) {
      entries.push({
        key,
        text: formatJs.text,
        context: formatJs.context ?? null,
        type: "string",
      });
      continue;
    }

    const leaf = formatLeafValue(value);
    if (leaf !== null) {
      entries.push({
        key,
        text: leaf,
        context: null,
        type: "string",
      });
      continue;
    }

    const flattened = new Map<string, string>();
    flattenJsonObject(flattened, key, value);
    for (const [flatKey, text] of flattened.entries()) {
      entries.push({
        key: flatKey,
        text,
        context: null,
        type: "string",
      });
    }
  }

  return entries;
}

function parseJsonCatalog(
  text: string,
  filename: string,
): Result<Record<string, unknown>, ParseTranslationFileEntriesError> {
  const extension = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  const jsonText = extension === ".jsonc" ? normalizeJsonc(text) : text;
  const parsed = safeJsonParse(jsonText);
  if (isErr(parsed)) {
    return err({ code: "invalid_json" });
  }

  if (!parsed.value || typeof parsed.value !== "object" || Array.isArray(parsed.value)) {
    return err({ code: "invalid_catalog_shape" });
  }

  return ok(parsed.value as Record<string, unknown>);
}

function extractEntriesFromCatalog(payload: Record<string, unknown>): ProjectSourceStringEntry[] {
  const topLevelEntries = parseTopLevelEntries(payload);
  if (topLevelEntries.length > 0) {
    return topLevelEntries;
  }

  const flattened = new Map<string, string>();
  flattenJsonObject(flattened, "", payload);

  return [...flattened.entries()].map(([key, text]) => ({
    key,
    text,
    context: null,
    type: "string",
  }));
}

export function parseTranslationFileEntries(input: {
  filename: string;
  text: string;
}): Result<ProjectSourceStringEntry[], ParseTranslationFileEntriesError> {
  const extension = input.filename.slice(input.filename.lastIndexOf(".")).toLowerCase();

  if (extension !== ".json" && extension !== ".jsonc") {
    return ok([]);
  }

  const catalogResult = parseJsonCatalog(input.text, input.filename);
  if (isErr(catalogResult)) {
    return catalogResult;
  }

  return ok(extractEntriesFromCatalog(catalogResult.value));
}
