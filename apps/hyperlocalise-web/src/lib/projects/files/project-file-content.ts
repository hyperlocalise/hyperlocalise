import type {
  ProjectFileContent,
  ProjectSourceStringEntry,
  ProjectSourceStringsPreview,
} from "@/api/routes/project/project.schema";

type StoredSourceStringsPreviewPayload = {
  sourceStrings?: ProjectSourceStringsPreview;
};

type LegacyCrowdinPreviewPayload = {
  strings?: Array<{
    id?: number;
    key?: string;
    text?: unknown;
    type?: string;
    context?: string | null;
  }>;
  truncated?: boolean;
  note?: string;
};

function formatSourceStringText(text: unknown): string {
  if (typeof text === "string") {
    return text;
  }

  if (text === null || text === undefined) {
    return "";
  }

  if (typeof text === "object") {
    return JSON.stringify(text);
  }

  return JSON.stringify(text);
}

export function buildSourceStringsPreviewContent(input: {
  entries: ProjectSourceStringEntry[];
  truncated: boolean;
  note?: string;
}): ProjectFileContent {
  if (input.entries.length === 0) {
    return {};
  }

  const sourceStrings: ProjectSourceStringsPreview = {
    truncated: input.truncated,
    note: input.note,
    entries: input.entries,
  };

  return { sourceStrings };
}

export function parseSourceStringsFromFileContent(
  content: ProjectFileContent | null | undefined,
): ProjectSourceStringsPreview | null {
  if (!content) {
    return null;
  }

  if (content.sourceStrings) {
    return content.sourceStrings;
  }

  if (!content.text) {
    return null;
  }

  try {
    const parsed = JSON.parse(content.text) as StoredSourceStringsPreviewPayload &
      LegacyCrowdinPreviewPayload;

    if (parsed.sourceStrings?.entries?.length) {
      return parsed.sourceStrings;
    }

    if (!Array.isArray(parsed.strings) || parsed.strings.length === 0) {
      return null;
    }

    const entries: ProjectSourceStringEntry[] = [];
    for (const entry of parsed.strings) {
      const key = typeof entry.key === "string" ? entry.key.trim() : "";
      if (!key) {
        continue;
      }

      entries.push({
        key,
        text: formatSourceStringText(entry.text),
        context: typeof entry.context === "string" ? entry.context : null,
        type: typeof entry.type === "string" ? entry.type : undefined,
        id: typeof entry.id === "number" ? entry.id : undefined,
      });
    }

    if (entries.length === 0) {
      return null;
    }

    return {
      truncated: parsed.truncated === true,
      note: typeof parsed.note === "string" ? parsed.note : undefined,
      entries,
    };
  } catch {
    return null;
  }
}

export function normalizeProjectFileContent(
  content: ProjectFileContent | null | undefined,
): ProjectFileContent | null {
  if (!content) {
    return null;
  }

  const sourceStrings = parseSourceStringsFromFileContent(content);
  if (sourceStrings) {
    return { sourceStrings };
  }

  if (content.text?.trim()) {
    return { text: content.text };
  }

  return Object.keys(content).length > 0 ? content : null;
}

export function hasRenderableFilePreview(content: ProjectFileContent | null | undefined) {
  if (!content) {
    return false;
  }

  if (content.text?.trim()) {
    return true;
  }

  const sourceStrings = parseSourceStringsFromFileContent(content);
  return Boolean(sourceStrings && sourceStrings.entries.length > 0);
}
