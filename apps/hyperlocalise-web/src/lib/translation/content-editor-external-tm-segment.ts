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
import { CrowdinApiClient } from "@/lib/providers/adapters/crowdin/crowdin-api";
import type { CrowdinTranslationMemorySegment } from "@/lib/providers/adapters/crowdin/crowdin-api";
import { toCrowdinGlossaryLanguageId } from "@/lib/providers/adapters/crowdin/crowdin-glossary-language";
import { tryLoadActiveTmsProviderContext } from "@/lib/providers/jobs/tms-provider-live";
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";

import type { ContentEditorTmSegment } from "./content-editor-tm-segment";

export type ContentEditorExternalTmSegmentError = {
  code:
    | "tm_segment_not_found"
    | "tm_segment_unsupported"
    | "invalid_tm_segment"
    | "provider_unavailable";
  message: string;
};

export type ContentEditorExternalTmSegmentRef = {
  providerKind: "crowdin";
  externalResourceId: string;
  externalSegmentId: string;
};

function parsePositiveInt(value: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

export function toCatTmSegmentFromCrowdin(
  segment: CrowdinTranslationMemorySegment,
  sourceLocale: string,
): ContentEditorTmSegment | null {
  if (segment.records.length === 0) {
    return null;
  }

  const sourceLanguageId = toCrowdinGlossaryLanguageId(sourceLocale);
  const sourceRecord =
    segment.records.find((record) => record.languageId === sourceLanguageId) ?? segment.records[0];
  const source = {
    id: String(sourceRecord.id),
    locale: sourceRecord.languageId,
    text: sourceRecord.text,
    isSource: true,
  };
  const records = [
    source,
    ...segment.records
      .filter((record) => record.id !== sourceRecord.id)
      .map((record) => ({
        id: String(record.id),
        locale: record.languageId,
        text: record.text,
        isSource: false,
      })),
  ];
  return { source, records };
}

async function requireCrowdinClient(input: {
  organizationId: string;
  actorUserId?: string | null;
}): Promise<Result<CrowdinApiClient, ContentEditorExternalTmSegmentError>> {
  const context = await tryLoadActiveTmsProviderContext(input.organizationId, {
    actorUserId: input.actorUserId,
  });
  if (!context || context.providerKind !== "crowdin") {
    return err({
      code: "provider_unavailable" as const,
      message: "Crowdin is not the active translation provider",
    });
  }
  return ok(
    new CrowdinApiClient({
      token: context.secretMaterial,
      baseUrl: context.credential.baseUrl ?? undefined,
    }),
  );
}

async function loadCrowdinSegment(
  client: CrowdinApiClient,
  ref: ContentEditorExternalTmSegmentRef,
): Promise<
  Result<
    { tmId: number; recordId: number; segment: CrowdinTranslationMemorySegment },
    ContentEditorExternalTmSegmentError
  >
> {
  const tmId = parsePositiveInt(ref.externalResourceId);
  const recordId = parsePositiveInt(ref.externalSegmentId);
  if (tmId === null || recordId === null) {
    return err({
      code: "invalid_tm_segment" as const,
      message: "Translation memory segment is invalid",
    });
  }

  const segment = await client.findTranslationMemorySegmentByRecordId(tmId, recordId);
  if (!segment) {
    return err({
      code: "tm_segment_not_found" as const,
      message: "Translation memory segment not found",
    });
  }
  return ok({ tmId, recordId, segment });
}

export async function loadContentEditorExternalTmSegment(input: {
  organizationId: string;
  actorUserId?: string | null;
  sourceLocale: string;
  ref: ContentEditorExternalTmSegmentRef;
}): Promise<Result<ContentEditorTmSegment, ContentEditorExternalTmSegmentError>> {
  if (input.ref.providerKind !== "crowdin") {
    return err({
      code: "tm_segment_unsupported",
      message: "This translation memory cannot be edited here",
    });
  }

  const clientResult = await requireCrowdinClient(input);
  if (isErr(clientResult)) {
    return clientResult;
  }

  const loaded = await loadCrowdinSegment(clientResult.value, input.ref);
  if (isErr(loaded)) {
    return loaded;
  }

  const mapped = toCatTmSegmentFromCrowdin(loaded.value.segment, input.sourceLocale);
  if (!mapped) {
    return err({
      code: "tm_segment_not_found",
      message: "Translation memory segment not found",
    });
  }
  return ok(mapped);
}

export async function updateContentEditorExternalTmSegment(input: {
  organizationId: string;
  actorUserId?: string | null;
  sourceLocale: string;
  ref: ContentEditorExternalTmSegmentRef;
  sourceText: string;
  records: Array<{ id: string; text: string }>;
}): Promise<Result<ContentEditorTmSegment, ContentEditorExternalTmSegmentError>> {
  if (!input.sourceText.trim()) {
    return err({
      code: "invalid_tm_segment",
      message: "Source text is required",
    });
  }

  const clientResult = await requireCrowdinClient(input);
  if (isErr(clientResult)) {
    return clientResult;
  }
  const loaded = await loadCrowdinSegment(clientResult.value, input.ref);
  if (isErr(loaded)) {
    return loaded;
  }

  const current = toCatTmSegmentFromCrowdin(loaded.value.segment, input.sourceLocale);
  if (!current) {
    return err({
      code: "tm_segment_not_found",
      message: "Translation memory segment not found",
    });
  }

  const nextById = new Map(input.records.map((record) => [record.id, record.text]));
  nextById.set(current.source.id, input.sourceText);
  const patches = loaded.value.segment.records.map((record) => ({
    id: record.id,
    text: nextById.get(String(record.id)) ?? record.text,
  }));

  const updated = await clientResult.value.updateTranslationMemorySegment(
    loaded.value.tmId,
    loaded.value.segment.id,
    patches,
  );
  const mapped = toCatTmSegmentFromCrowdin(updated, input.sourceLocale);
  if (!mapped) {
    return err({
      code: "tm_segment_not_found",
      message: "Translation memory segment not found",
    });
  }
  return ok(mapped);
}

export async function deleteContentEditorExternalTmSegmentRecord(input: {
  organizationId: string;
  actorUserId?: string | null;
  sourceLocale: string;
  ref: ContentEditorExternalTmSegmentRef;
  recordId: string;
}): Promise<Result<void, ContentEditorExternalTmSegmentError>> {
  const clientResult = await requireCrowdinClient(input);
  if (isErr(clientResult)) {
    return clientResult;
  }
  const loaded = await loadCrowdinSegment(clientResult.value, input.ref);
  if (isErr(loaded)) {
    return loaded;
  }

  const current = toCatTmSegmentFromCrowdin(loaded.value.segment, input.sourceLocale);
  if (!current) {
    return err({
      code: "tm_segment_not_found",
      message: "Translation memory segment not found",
    });
  }
  if (current.source.id === input.recordId) {
    return err({
      code: "invalid_tm_segment",
      message: "The source locale cannot be deleted",
    });
  }

  const remaining = loaded.value.segment.records.filter(
    (record) => String(record.id) !== input.recordId,
  );
  if (remaining.length === loaded.value.segment.records.length) {
    return err({
      code: "tm_segment_not_found",
      message: "Translation memory segment not found",
    });
  }
  if (remaining.length === 0) {
    await clientResult.value.deleteTranslationMemorySegment(
      loaded.value.tmId,
      loaded.value.segment.id,
    );
    return ok(undefined);
  }

  await clientResult.value.updateTranslationMemorySegment(
    loaded.value.tmId,
    loaded.value.segment.id,
    remaining.map((record) => ({ id: record.id, text: record.text })),
  );
  return ok(undefined);
}
