import { parseCsvRows } from "@/lib/csv/parse-csv-rows";

export const ISSUE_SHEET_IMPORT_MAX_ROWS = 2_000;
export const ISSUE_SHEET_IMPORT_MAX_CONTENT_BYTES = 2 * 1024 * 1024;
export const ISSUE_SHEET_IMPORT_MAX_COLUMN_KEY_LENGTH = 64;
export const ISSUE_SHEET_IMPORT_MAX_NEW_COLUMNS = 20;

const textEncoder = new TextEncoder();

export function getIssueSheetImportContentByteLength(content: string) {
  return textEncoder.encode(content).byteLength;
}

export function issueSheetImportContentExceedsByteLimit(content: string) {
  return getIssueSheetImportContentByteLength(content) > ISSUE_SHEET_IMPORT_MAX_CONTENT_BYTES;
}

export type IssueSheetSystemField =
  | "title"
  | "description"
  | "status"
  | "issue_type"
  | "target_locale"
  | "source_path"
  | "segment_id"
  | "external_ref"
  | "link_url"
  | "assignee";

export type IssueSheetImportColumnType = "text" | "long_text" | "select";

export type IssueSheetImportColumnMapping =
  | { kind: "system"; field: IssueSheetSystemField }
  | { kind: "column"; columnId: string }
  | {
      kind: "create";
      key: string;
      label: string;
      type: IssueSheetImportColumnType;
    }
  | { kind: "skip" };

export type IssueSheetImportMappingColumn = {
  id: string;
  key: string;
  label: string;
};

export type IssueSheetSuggestedMapping = {
  csvHeader: string;
  target: IssueSheetImportColumnMapping;
};

export type IssueSheetImportStatus = "open" | "in_progress" | "resolved" | "wont_fix";

export type IssueSheetImportIssueType =
  | "general_question"
  | "translation_mistake"
  | "context_request"
  | "source_mistake"
  | "glossary_violation"
  | "qa_failure";

const SYSTEM_FIELD_LABELS: Record<IssueSheetSystemField, string> = {
  title: "Title",
  description: "Description",
  status: "Status",
  issue_type: "Type",
  target_locale: "Locale",
  source_path: "Source path",
  segment_id: "Segment ID",
  external_ref: "External ID",
  link_url: "Link URL",
  assignee: "Assignee",
};

const SYSTEM_FIELD_ALIASES: Record<string, IssueSheetSystemField> = {
  title: "title",
  summary: "title",
  "issue title": "title",
  issue: "title",
  name: "title",
  subject: "title",
  description: "description",
  details: "description",
  body: "description",
  notes: "description",
  comment: "description",
  status: "status",
  state: "status",
  workflow: "status",
  "issue type": "issue_type",
  type: "issue_type",
  category: "issue_type",
  kind: "issue_type",
  locale: "target_locale",
  language: "target_locale",
  "target locale": "target_locale",
  "target language": "target_locale",
  "source path": "source_path",
  file: "source_path",
  filepath: "source_path",
  path: "source_path",
  "segment id": "segment_id",
  segment: "segment_id",
  key: "segment_id",
  "string key": "segment_id",
  "external id": "external_ref",
  "external ref": "external_ref",
  id: "external_ref",
  "ticket id": "external_ref",
  "ticket #": "external_ref",
  ticket: "external_ref",
  "issue id": "external_ref",
  "link url": "link_url",
  url: "link_url",
  link: "link_url",
  assignee: "assignee",
  owner: "assignee",
  "assigned to": "assignee",
};

const JUNK_HEADERS = new Set(["", "#", "row", "row id", "row #", "row number", "index"]);

const STATUS_ALIASES: Record<string, IssueSheetImportStatus> = {
  open: "open",
  new: "open",
  todo: "open",
  backlog: "open",
  "in progress": "in_progress",
  "in-progress": "in_progress",
  doing: "in_progress",
  active: "in_progress",
  resolved: "resolved",
  done: "resolved",
  closed: "resolved",
  fixed: "resolved",
  complete: "resolved",
  completed: "resolved",
  "won't fix": "wont_fix",
  wontfix: "wont_fix",
  "wont fix": "wont_fix",
  invalid: "wont_fix",
  rejected: "wont_fix",
};

const ISSUE_TYPE_ALIASES: Record<string, IssueSheetImportIssueType> = {
  general_question: "general_question",
  question: "general_question",
  general: "general_question",
  translation_mistake: "translation_mistake",
  translation: "translation_mistake",
  mistake: "translation_mistake",
  context_request: "context_request",
  context: "context_request",
  source_mistake: "source_mistake",
  source: "source_mistake",
  glossary_violation: "glossary_violation",
  glossary: "glossary_violation",
  qa_failure: "qa_failure",
  qa: "qa_failure",
  lqa: "qa_failure",
};

export function issueSheetSystemFieldLabel(field: IssueSheetSystemField) {
  return SYSTEM_FIELD_LABELS[field];
}

export function issueSheetSystemFields(): IssueSheetSystemField[] {
  return Object.keys(SYSTEM_FIELD_LABELS) as IssueSheetSystemField[];
}

function normalizeHeader(header: string) {
  return header.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

export function slugifyIssueSheetColumnKey(label: string) {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
  if (!slug) {
    return "imported_column";
  }
  return /^[a-z]/.test(slug) ? slug : `col_${slug}`;
}

function isJunkHeader(header: string) {
  return JUNK_HEADERS.has(normalizeHeader(header));
}

function columnHasData(rows: string[][], columnIndex: number) {
  return rows.some((row) => (row[columnIndex] ?? "").trim().length > 0);
}

function matchSystemField(header: string): IssueSheetSystemField | null {
  const normalized = normalizeHeader(header);
  if (SYSTEM_FIELD_ALIASES[normalized]) {
    return SYSTEM_FIELD_ALIASES[normalized];
  }
  for (const [alias, field] of Object.entries(SYSTEM_FIELD_ALIASES)) {
    if (normalized.includes(alias) && alias.length >= 4) {
      return field;
    }
  }
  return null;
}

function matchExistingColumn(
  header: string,
  columns: IssueSheetImportMappingColumn[],
): IssueSheetImportMappingColumn | null {
  const normalized = normalizeHeader(header);
  return (
    columns.find(
      (column) =>
        normalizeHeader(column.label) === normalized || normalizeHeader(column.key) === normalized,
    ) ?? null
  );
}

export function inferIssueSheetImportColumnType(values: string[]): IssueSheetImportColumnType {
  const nonEmpty = values.map((value) => value.trim()).filter(Boolean);
  if (nonEmpty.length === 0) {
    return "text";
  }

  if (nonEmpty.some((value) => value.length > 200)) {
    return "long_text";
  }

  const unique = new Set(nonEmpty.map((value) => value.toLowerCase()));
  if (unique.size <= 12) {
    const ratio = unique.size / nonEmpty.length;
    if (ratio <= 0.5 || unique.size <= 8) {
      return "select";
    }
  }

  return "text";
}

export function uniqueIssueSheetColumnKey(
  label: string,
  usedKeys: Set<string>,
  existingKeys: Iterable<string>,
) {
  const existing = new Set(existingKeys);
  const base = slugifyIssueSheetColumnKey(label).slice(0, ISSUE_SHEET_IMPORT_MAX_COLUMN_KEY_LENGTH);
  if (!usedKeys.has(base) && !existing.has(base)) {
    return base;
  }

  for (let suffix = 2; suffix < 1_000; suffix += 1) {
    const suffixText = `_${suffix}`;
    const trimmedBase = base.slice(0, ISSUE_SHEET_IMPORT_MAX_COLUMN_KEY_LENGTH - suffixText.length);
    const candidate = `${trimmedBase}${suffixText}`;
    if (!usedKeys.has(candidate) && !existing.has(candidate)) {
      return candidate;
    }
  }

  throw new Error("issue_sheet_import_column_key_collision");
}

export function suggestIssueSheetImportMappings(input: {
  headers: string[];
  rows: string[][];
  columns: IssueSheetImportMappingColumn[];
}): IssueSheetSuggestedMapping[] {
  const usedSystemFields = new Set<IssueSheetSystemField>();
  const usedColumnIds = new Set<string>();
  const usedCreateKeys = new Set<string>();

  return input.headers.map((csvHeader, columnIndex) => {
    if (isJunkHeader(csvHeader) || !columnHasData(input.rows, columnIndex)) {
      return { csvHeader, target: { kind: "skip" } };
    }

    const systemField = matchSystemField(csvHeader);
    if (systemField && !usedSystemFields.has(systemField)) {
      usedSystemFields.add(systemField);
      return { csvHeader, target: { kind: "system", field: systemField } };
    }

    const existing = matchExistingColumn(csvHeader, input.columns);
    if (existing && !usedColumnIds.has(existing.id)) {
      usedColumnIds.add(existing.id);
      return { csvHeader, target: { kind: "column", columnId: existing.id } };
    }

    const columnValues = input.rows.map((row) => row[columnIndex] ?? "");
    const inferredType = inferIssueSheetImportColumnType(columnValues);
    const key = uniqueIssueSheetColumnKey(
      csvHeader,
      usedCreateKeys,
      input.columns.map((column) => column.key),
    );
    usedCreateKeys.add(key);

    return {
      csvHeader,
      target: {
        kind: "create",
        key,
        label: csvHeader.trim() || key,
        type: inferredType,
      },
    };
  });
}

export function parseIssueSheetImportCsv(content: string) {
  if (issueSheetImportContentExceedsByteLimit(content)) {
    throw new Error("issue_sheet_import_file_too_large");
  }

  const rows = parseCsvRows(content);
  if (rows.length === 0) {
    throw new Error("issue_sheet_import_empty_csv");
  }

  const [headerRow, ...dataRows] = rows;
  const headers = headerRow.map((cell, index) => cell.trim() || `Column ${index + 1}`);
  const bodyRows = dataRows.filter((row) => row.some((cell) => cell.trim().length > 0));

  if (bodyRows.length > ISSUE_SHEET_IMPORT_MAX_ROWS) {
    throw new Error("issue_sheet_import_too_many_rows");
  }

  return { headers, rows: bodyRows };
}

export function normalizeIssueSheetImportStatus(raw: string): {
  status?: IssueSheetImportStatus;
  error?: string;
} {
  const normalized = raw.trim().toLowerCase().replace(/[_-]+/g, " ");
  if (!normalized) {
    return { status: "open" };
  }
  const status = STATUS_ALIASES[normalized];
  if (status) {
    return { status };
  }
  return { error: `Unknown status: ${raw.trim()}` };
}

export function normalizeIssueSheetImportIssueType(raw: string): {
  issueType: IssueSheetImportIssueType;
  warning?: string;
} {
  const normalized = raw
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (!normalized) {
    return { issueType: "general_question" };
  }
  const issueType = ISSUE_TYPE_ALIASES[normalized];
  if (issueType) {
    return { issueType };
  }
  return {
    issueType: "general_question",
    warning: `Unknown issue type "${raw.trim()}", defaulted to general question`,
  };
}

export function issueSheetImportHasTitleMapping(mapping: IssueSheetImportColumnMapping[]) {
  return mapping.some((entry) => entry.kind === "system" && entry.field === "title");
}

export function countIssueSheetImportCreateMappings(mapping: IssueSheetImportColumnMapping[]) {
  return mapping.filter((entry) => entry.kind === "create").length;
}
