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

export type GoSvcQueryValue = string | number | boolean | null | undefined;
export type GoSvcQuery = Record<string, GoSvcQueryValue | readonly GoSvcQueryValue[]>;
export type GoSvcRecord = Record<string, unknown>;

export type GoSvcRequestOptions = {
  signal?: AbortSignal;
};

export type GoSvcPageQuery = {
  limit?: number;
  offset?: number;
};

export type GoSvcDownload = {
  blob: Blob;
  contentType: string | null;
  filename: string | null;
  extension: string | null;
};

export type GoSvcErrorBody = {
  error?: string;
  message?: string;
  details?: unknown;
};

export type DictionaryRecord = {
  id: string;
  organizationId: string;
  createdByUserId: string | null;
  name: string;
  description: string;
  status: "active" | "draft" | "archived";
  wordsVersion: number;
  wordCount: number;
  createdAt: string;
  updatedAt: string;
};

export type DictionaryWord = {
  id: string;
  locale: string;
  word: string;
  createdAt: string;
};

export type DictionaryProject = {
  projectId: string;
  projectName: string;
  priority: number;
};

export type GlossaryRecord = {
  id: string;
  organizationId: string;
  createdByUserId: string | null;
  name: string;
  description: string;
  sourceLocale: string;
  targetLocale: string | null;
  languages: { locale: string; name: string; isSource: boolean }[];
  status: string;
  source: string;
  controlLevel: string;
  teamId: string | null;
  teamName?: string | null;
  localeCoverage: string[];
  termCount: number | null;
  projectCount: number;
  createdAt: string;
  updatedAt: string;
} & GoSvcRecord;

export type GlossaryConcept = {
  id: string;
  glossaryId: string;
  primaryTerm: string;
  subject: string;
  definition: string;
  translatable: boolean;
  note: string;
  url: string | null;
  figure?: string | null;
  createdAt: string;
  updatedAt: string;
  terms: GlossaryTerm[];
};

export type GlossaryTerm = {
  id: string;
  glossaryId: string;
  conceptId: string;
  locale: string;
  term: string;
  isPrimary: boolean;
  description: string;
  note: string;
  partOfSpeech: string;
  gender: string | null;
  termType: string | null;
  url?: string | null;
  lemma?: string | null;
  status: string;
  caseSensitive: boolean;
  forbidden: boolean;
  provenance: string;
  reviewStatus: string;
  createdAt: string;
  updatedAt: string;
};

export type GlossaryProject = {
  projectId: string;
  projectName: string;
  priority: number;
  sourceLocale: string | null;
  targetLocales: string[];
  externalUrl: string | null;
};

export type MemoryRecord = {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  status: string;
  source: string;
  createdAt: string;
  updatedAt: string;
} & GoSvcRecord;

export type MemoryEntry = {
  id: string;
  memoryId: string;
  sourceLocale: string;
  targetLocale: string;
  sourceText: string;
  targetText: string;
  matchScore: number;
  provenance: string;
  reviewStatus: string;
  version: number;
  externalKey: string | null;
  metadata: GoSvcRecord;
  createdAt: string;
  updatedAt: string;
  reviewedAt: string | null;
} & GoSvcRecord;

export type MemoryProject = {
  projectId: string;
  projectName: string;
  priority: number;
  sourceLocale: string | null;
  targetLocales: string[];
};

export type TeamRecord = {
  id: string;
  organizationId: string;
  slug: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type TeamMember = {
  workosUserId: string;
  email: string;
  role: "manager" | "member";
};

export type TeamSummary = Omit<TeamRecord, "organizationId"> & {
  memberCount: number;
  currentUserRole: TeamMember["role"] | null;
};

export type IssueSheetListQuery = GoSvcPageQuery & {
  view?: "my_work" | "qa_triage" | "source_context" | "all_open";
  status?: "open" | "in_progress" | "resolved" | "wont_fix" | "all";
  issueType?: string;
  priority?: "P0" | "P1" | "P2";
  locale?: string;
  assignee?: string;
  translationKeyId?: string;
  qaCheckType?: string;
  search?: string;
  sort?: "updated_at" | "created_at" | "priority" | "status";
  sortDir?: "asc" | "desc";
};

export type ActivityLogQuery = {
  actor?: string;
  cursor?: string;
  eventTypes?: readonly string[];
  limit?: number;
  range?: "24h" | "7d" | "30d" | "all";
};

export type ActivityLogItem = {
  id: string;
  eventType: string;
  actor: GoSvcRecord;
  target: GoSvcRecord;
  payload: GoSvcRecord;
  createdAt: string;
};

export type ValidateSegmentBody = {
  sourceText: string;
  targetText: string;
  sourcePath: string;
  maxLength?: number;
  modes?: readonly string[];
  targetLocale?: string;
  acceptedWords?: readonly string[];
};

export type ValidateSegmentResult = {
  checks: GoSvcRecord[];
  skippedModes?: string[];
};

export type EditorExportBody = {
  format: "csv" | "tmx" | "xlf" | "xliff" | "xlsx";
  rows: GoSvcRecord[];
  [key: string]: unknown;
};
