import type { ProjectSourceStringEntry } from "@/api/routes/project/project.schema";

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

function parseFormatJsCatalog(payload: Record<string, unknown>) {
  const entries = new Map<string, { text: string; context?: string }>();

  for (const [key, value] of Object.entries(payload)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return null;
    }

    const message = value as Record<string, unknown>;
    const defaultMessage = message.defaultMessage;
    if (typeof defaultMessage !== "string") {
      return null;
    }

    const description = typeof message.description === "string" ? message.description : undefined;
    entries.set(key, { text: defaultMessage, context: description });
  }

  return entries.size > 0 ? entries : null;
}

export function parseTranslationFileEntries(input: {
  filename: string;
  text: string;
}): ProjectSourceStringEntry[] {
  const extension = input.filename.slice(input.filename.lastIndexOf(".")).toLowerCase();

  if (extension !== ".json" && extension !== ".jsonc") {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(input.text);
  } catch {
    return [];
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return [];
  }

  const payload = parsed as Record<string, unknown>;
  const formatJs = parseFormatJsCatalog(payload);
  if (formatJs) {
    return [...formatJs.entries()].map(([key, entry]) => ({
      key,
      text: entry.text,
      context: entry.context ?? null,
      type: "string",
    }));
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
