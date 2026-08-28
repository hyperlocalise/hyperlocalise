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

export type TmxIssueSeverity = "warning" | "error";

export type TmxIssue = {
  severity: TmxIssueSeverity;
  code: string;
  message: string;
  unitIndex?: number;
  tuid?: string;
};

export type TmxFatalError = {
  code:
    | "malformed_xml"
    | "unsupported_encoding"
    | "doctype_forbidden"
    | "unit_limit_exceeded"
    | "empty_tmx"
    | "oversized_content";
  message: string;
  unitCount?: number;
  maxUnits?: number;
};

export type TmxProperty = {
  type: string;
  value: string;
};

export type TmxVariant = {
  language: string;
  segment: string;
  properties: TmxProperty[];
  notes: string[];
  creationdate?: string;
  changedate?: string;
  creationid?: string;
  changeid?: string;
};

export type TmxUnit = {
  unitIndex: number;
  tuid?: string;
  srclang?: string;
  creationdate?: string;
  changedate?: string;
  creationid?: string;
  changeid?: string;
  properties: TmxProperty[];
  notes: string[];
  variants: TmxVariant[];
};

export type TmxHeader = {
  srclang?: string;
  adminlang?: string;
  creationtool?: string;
  creationtoolversion?: string;
  segtype?: string;
  oTmf?: string;
  datatype?: string;
  creationdate?: string;
  creationid?: string;
  changedate?: string;
  changeid?: string;
  properties: TmxProperty[];
  notes: string[];
};

export type TmxDocument = {
  version?: string;
  encoding?: string;
  header: TmxHeader;
  units: TmxUnit[];
  issues: TmxIssue[];
  totalUnits: number;
};

export type MemoryImportCandidate = {
  sourceLocale: string;
  targetLocale: string;
  sourceText: string;
  targetText: string;
  matchScore: number;
  externalKey: string | null;
  metadata: Record<string, unknown>;
  unitIndex: number;
  tuid?: string;
  isVariant: boolean;
};

export type MemoryImportReport = {
  totalRead: number;
  created: number;
  updated: number;
  variantCreated: number;
  skipped: number;
  warned: number;
  failed: number;
  issues: TmxIssue[];
  headerSrclang?: string;
  truncatedIssues: boolean;
};

export type MemoryImportPreviewEntry = {
  sourceLocale: string;
  targetLocale: string;
  sourceText: string;
  targetText: string;
  externalKey: string | null;
  tuid?: string;
  action: "create" | "update" | "variant" | "skip";
};

export type TmxExportEntry = {
  sourceLocale: string;
  targetLocale: string;
  sourceText: string;
  targetText: string;
  tuid?: string;
  metadata?: Record<string, unknown>;
};
