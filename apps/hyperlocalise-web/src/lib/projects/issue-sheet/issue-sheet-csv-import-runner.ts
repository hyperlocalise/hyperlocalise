import { and, eq } from "drizzle-orm";

import type { IssueSheetImportBody } from "@/api/routes/project/issue-sheet.schema";
import { db, schema } from "@/lib/database";

import {
  countIssueSheetImportCreateMappings,
  ISSUE_SHEET_IMPORT_MAX_NEW_COLUMNS,
  issueSheetImportHasTitleMapping,
  normalizeIssueSheetImportIssueType,
  normalizeIssueSheetImportStatus,
  parseIssueSheetImportCsv,
  type IssueSheetImportColumnMapping,
  type IssueSheetSystemField,
} from "./issue-sheet-csv-import";
import type { IssueSheetColumn, IssueSheetService } from "./issue-sheet-service";

export type IssueSheetImportResult = {
  dryRun: boolean;
  totalRows: number;
  created: number;
  skippedDuplicates: number;
  skippedInvalid: number;
  warnings: { row: number; message: string }[];
  errors: { row: number; message: string }[];
  columnsCreated: { key: string; label: string }[];
};

type ParsedRow = {
  rowNumber: number;
  system: Partial<Record<IssueSheetSystemField, string>>;
  custom: { mapping: IssueSheetImportColumnMapping; value: string }[];
};

type ColumnLookup = Map<string, IssueSheetColumn>;

function buildHeaderMappings(headers: string[], mapping: IssueSheetImportBody["mapping"]) {
  const indexByHeader = new Map(headers.map((header, index) => [header, index]));
  return mapping.map((entry) => ({
    csvHeader: entry.csvHeader,
    target: entry.target,
    columnIndex: indexByHeader.get(entry.csvHeader) ?? -1,
  }));
}

function resolveSelectValue(
  column: IssueSheetColumn,
  raw: string,
): { value: string | null; warning?: string } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { value: null };
  }

  const options = Array.isArray(column.config.options) ? column.config.options : [];
  const byId = options.find((option) => option.id.toLowerCase() === trimmed.toLowerCase());
  if (byId) {
    return { value: byId.id };
  }
  const byLabel = options.find((option) => option.label.toLowerCase() === trimmed.toLowerCase());
  if (byLabel) {
    return { value: byLabel.id };
  }

  return {
    value: null,
    warning: `Value "${trimmed}" is not a valid option for ${column.label}`,
  };
}

export async function runIssueSheetCsvImport(
  service: IssueSheetService,
  input: {
    organizationId: string;
    projectId: string;
    actorUserId: string;
    body: IssueSheetImportBody;
  },
): Promise<IssueSheetImportResult> {
  const skipInvalidRows = input.body.options?.skipInvalidRows ?? true;
  const result: IssueSheetImportResult = {
    dryRun: input.body.dryRun,
    totalRows: 0,
    created: 0,
    skippedDuplicates: 0,
    skippedInvalid: 0,
    warnings: [],
    errors: [],
    columnsCreated: [],
  };

  if (!issueSheetImportHasTitleMapping(input.body.mapping.map((entry) => entry.target))) {
    throw new Error("issue_sheet_import_missing_title_mapping");
  }

  if (
    countIssueSheetImportCreateMappings(input.body.mapping.map((entry) => entry.target)) >
    ISSUE_SHEET_IMPORT_MAX_NEW_COLUMNS
  ) {
    throw new Error("issue_sheet_import_too_many_new_columns");
  }

  const parsed = parseIssueSheetImportCsv(input.body.content);
  result.totalRows = parsed.rows.length;

  if (parsed.rows.length === 0) {
    return result;
  }

  await service.ensureStarterColumns({
    organizationId: input.organizationId,
    projectId: input.projectId,
    actorUserId: input.actorUserId,
  });

  let columns = await service.listColumns({
    organizationId: input.organizationId,
    projectId: input.projectId,
    actorUserId: input.actorUserId,
  });

  const mappingWithHeaders = input.body.mapping;

  if (!input.body.dryRun) {
    for (const entry of mappingWithHeaders) {
      if (entry.target.kind !== "create") {
        continue;
      }
      const createTarget = entry.target;
      const exists = columns.some((column) => column.key === createTarget.key);
      if (exists) {
        continue;
      }

      const config =
        createTarget.type === "select"
          ? {
              options: [
                ...new Set(
                  parsed.rows
                    .map((row) => {
                      const columnIndex = parsed.headers.indexOf(entry.csvHeader);
                      return columnIndex >= 0 ? (row[columnIndex] ?? "").trim() : "";
                    })
                    .filter(Boolean),
                ),
              ]
                .slice(0, 25)
                .map((value) => ({ id: value, label: value })),
            }
          : undefined;

      const column = await service.createColumn({
        organizationId: input.organizationId,
        projectId: input.projectId,
        actorUserId: input.actorUserId,
        body: {
          key: createTarget.key,
          label: createTarget.label,
          type: createTarget.type,
          config,
        },
      });
      columns = [...columns, column];
      result.columnsCreated.push({ key: column.key, label: column.label });
    }
  } else {
    for (const entry of mappingWithHeaders) {
      if (entry.target.kind === "create") {
        result.columnsCreated.push({ key: entry.target.key, label: entry.target.label });
      }
    }
  }

  const columnById: ColumnLookup = new Map(columns.map((column) => [column.id, column]));
  const columnByKey = new Map(columns.map((column) => [column.key, column]));

  const existingExternalRefs = new Set(
    (
      await db
        .select({ externalRef: schema.issueSheetIssues.externalRef })
        .from(schema.issueSheetIssues)
        .where(
          and(
            eq(schema.issueSheetIssues.organizationId, input.organizationId),
            eq(schema.issueSheetIssues.projectId, input.projectId),
          ),
        )
    )
      .map((row) => row.externalRef)
      .filter((ref): ref is string => ref != null),
  );

  const memberRows = await db
    .select({
      userId: schema.users.id,
      email: schema.users.email,
    })
    .from(schema.organizationMemberships)
    .innerJoin(schema.users, eq(schema.organizationMemberships.userId, schema.users.id))
    .where(eq(schema.organizationMemberships.organizationId, input.organizationId));

  const memberByEmail = new Map(
    memberRows.map((row) => [row.email.toLowerCase(), row.userId] as const),
  );

  const headerMappings = buildHeaderMappings(parsed.headers, input.body.mapping);

  const hasExternalRefMapping = headerMappings.some(
    (entry) => entry.target.kind === "system" && entry.target.field === "external_ref",
  );
  if (!hasExternalRefMapping) {
    result.warnings.push({
      row: 0,
      message: "No External ID column mapped — re-importing the same file may create duplicates",
    });
  }

  const parsedRows: ParsedRow[] = [];

  for (const [rowIndex, row] of parsed.rows.entries()) {
    const rowNumber = rowIndex + 2;
    const system: Partial<Record<IssueSheetSystemField, string>> = {};
    const custom: ParsedRow["custom"] = [];

    for (const entry of headerMappings) {
      if (entry.columnIndex < 0) {
        continue;
      }
      const raw = (row[entry.columnIndex] ?? "").trim();
      if (!raw && entry.target.kind !== "system") {
        continue;
      }

      if (entry.target.kind === "skip") {
        continue;
      }
      if (entry.target.kind === "system") {
        system[entry.target.field] = raw;
        continue;
      }
      custom.push({ mapping: entry.target, value: raw });
    }

    parsedRows.push({ rowNumber, system, custom });
  }

  const rowsToCreate: {
    rowNumber: number;
    title: string;
    description: string;
    issueType: string;
    status: string;
    targetLocale: string | null;
    sourcePath: string | null;
    segmentId: string | null;
    externalRef: string | null;
    linkUrl: string | null;
    assigneeUserId: string | null;
    customValues: { columnKey: string; value: unknown }[];
  }[] = [];

  for (const row of parsedRows) {
    const title = row.system.title?.trim() ?? "";
    if (!title) {
      result.skippedInvalid += 1;
      result.errors.push({ row: row.rowNumber, message: "Title is required" });
      continue;
    }

    const externalRef = row.system.external_ref?.trim() || null;
    if (externalRef && existingExternalRefs.has(externalRef)) {
      result.skippedDuplicates += 1;
      continue;
    }

    const statusResult = normalizeIssueSheetImportStatus(row.system.status ?? "");
    if (statusResult.error) {
      result.skippedInvalid += 1;
      result.errors.push({ row: row.rowNumber, message: statusResult.error });
      if (!skipInvalidRows) {
        return result;
      }
      continue;
    }

    const typeResult = normalizeIssueSheetImportIssueType(row.system.issue_type ?? "");
    if (typeResult.warning) {
      result.warnings.push({ row: row.rowNumber, message: typeResult.warning });
    }

    let assigneeUserId: string | null = null;
    const assigneeRaw = row.system.assignee?.trim();
    if (assigneeRaw) {
      const email = assigneeRaw.includes("@")
        ? assigneeRaw.toLowerCase()
        : assigneeRaw.toLowerCase();
      assigneeUserId = memberByEmail.get(email) ?? null;
      if (!assigneeUserId) {
        result.warnings.push({
          row: row.rowNumber,
          message: `Assignee "${assigneeRaw}" was not found in the organization`,
        });
      }
    }

    const customValues: { columnKey: string; value: unknown }[] = [];
    let rowInvalid = false;

    for (const entry of row.custom) {
      if (entry.mapping.kind === "column") {
        const column = columnById.get(entry.mapping.columnId);
        if (!column) {
          result.errors.push({ row: row.rowNumber, message: "Mapped column no longer exists" });
          rowInvalid = true;
          break;
        }
        if (column.type === "select") {
          const resolved = resolveSelectValue(column, entry.value);
          if (resolved.warning) {
            result.warnings.push({ row: row.rowNumber, message: resolved.warning });
          }
          if (resolved.value) {
            customValues.push({ columnKey: column.key, value: resolved.value });
          }
        } else if (column.type === "enrichment") {
          continue;
        } else {
          customValues.push({ columnKey: column.key, value: entry.value });
        }
      } else if (entry.mapping.kind === "create") {
        const column = columnByKey.get(entry.mapping.key);
        if (!column) {
          if (input.body.dryRun) {
            customValues.push({ columnKey: entry.mapping.key, value: entry.value });
          }
          continue;
        }
        if (column.type === "select") {
          const resolved = resolveSelectValue(column, entry.value);
          if (resolved.warning) {
            result.warnings.push({ row: row.rowNumber, message: resolved.warning });
          }
          if (resolved.value) {
            customValues.push({ columnKey: column.key, value: resolved.value });
          }
        } else {
          customValues.push({ columnKey: column.key, value: entry.value });
        }
      }
    }

    if (rowInvalid) {
      result.skippedInvalid += 1;
      continue;
    }

    const linkUrl = row.system.link_url?.trim() || null;
    rowsToCreate.push({
      rowNumber: row.rowNumber,
      title,
      description: row.system.description?.trim() ?? "",
      issueType: typeResult.issueType,
      status: statusResult.status ?? "open",
      targetLocale: row.system.target_locale?.trim() || null,
      sourcePath: row.system.source_path?.trim() || null,
      segmentId: row.system.segment_id?.trim() || null,
      externalRef,
      linkUrl,
      assigneeUserId,
      customValues,
    });

    if (externalRef) {
      existingExternalRefs.add(externalRef);
    }
  }

  result.created = rowsToCreate.length;

  if (input.body.dryRun || rowsToCreate.length === 0) {
    return result;
  }

  await db.transaction(async (tx) => {
    for (const row of rowsToCreate) {
      const [issue] = await tx
        .insert(schema.issueSheetIssues)
        .values({
          organizationId: input.organizationId,
          projectId: input.projectId,
          title: row.title,
          description: row.description,
          issueType: row.issueType,
          status: row.status,
          targetLocale: row.targetLocale,
          sourcePath: row.sourcePath,
          segmentId: row.segmentId,
          linkKind: row.linkUrl ? "url" : null,
          linkLabel: row.linkUrl ? "Open link" : null,
          linkUrl: row.linkUrl,
          externalRef: row.externalRef,
          reporterUserId: input.actorUserId,
          assigneeUserId: row.assigneeUserId,
          resolvedAt: row.status === "resolved" || row.status === "wont_fix" ? new Date() : null,
        })
        .returning({ id: schema.issueSheetIssues.id });

      if (!issue) {
        throw new Error("issue_sheet_import_insert_failed");
      }

      for (const value of row.customValues) {
        const column = columnByKey.get(value.columnKey);
        if (!column) {
          continue;
        }
        await tx
          .insert(schema.issueSheetRowValues)
          .values({
            organizationId: input.organizationId,
            projectId: input.projectId,
            issueId: issue.id,
            columnId: column.id,
            value: value.value,
            computedAt: null,
          })
          .onConflictDoUpdate({
            target: [schema.issueSheetRowValues.issueId, schema.issueSheetRowValues.columnId],
            set: {
              value: value.value,
              updatedAt: new Date(),
            },
          });
      }
    }
  });

  return result;
}
