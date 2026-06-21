import type {
  ProjectFileCatComment,
  ProjectFileCatQueueSummary,
  ProjectFileCatResponse,
  ProjectFileCatTranslation,
} from "@/api/routes/project/project.schema";
import { legacyProviderCatSegmentLimit } from "@/api/routes/project/project.schema";
import {
  buildCatFilePagination,
  type ProjectFileCatPaginationInput,
} from "@/lib/projects/cat/project-file-cat-pagination";
import { mapWithConcurrency } from "@/lib/primitives/map-with-concurrency/map-with-concurrency";
import type { TmsProviderLiveFile } from "@/lib/providers/tms-provider-live";

import {
  extractLokaliseKeyName,
  LOKALISE_DEFAULT_BASE_URL,
  LokaliseApiClient,
  LokaliseApiError,
  type LokaliseComment,
  type LokaliseKey,
  type LokaliseLanguage,
  type LokaliseTranslation,
} from "./lokalise-api";
import { mapLokaliseTranslationReadiness } from "./lokalise-locale-readiness";
import { parseLokaliseKeyId } from "./lokalise-write-back";

const KEY_ID_CHUNK_SIZE = 100;
const COMMENT_FETCH_CONCURRENCY = 8;

export class LokaliseLiveCatError extends Error {
  constructor(
    readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "LokaliseLiveCatError";
  }
}

type LokaliseCatSegmentDraft = {
  externalStringId: string;
  key: string;
  sourceText: string;
  context: string | null;
  type: string | null;
  target: ProjectFileCatTranslation | null;
  comments: ProjectFileCatComment[];
};

function mapLokaliseApiError(error: unknown): never {
  if (error instanceof LokaliseApiError && error.status === 401) {
    throw new LokaliseLiveCatError("lokalise_auth_invalid", "Lokalise credentials are invalid.");
  }

  throw error;
}

function readScopedKeyIds(file: TmsProviderLiveFile): number[] {
  const payload = file.metadata ?? {};
  const rawKeyIds = payload.keyIds;
  if (!Array.isArray(rawKeyIds)) {
    const keyId = parseLokaliseKeyId(
      typeof payload.id === "number"
        ? String(payload.id)
        : (file.provider?.externalResourceId ?? null),
    );
    return keyId != null ? [keyId] : [];
  }

  return rawKeyIds
    .map((value) => (typeof value === "number" ? value : Number(value)))
    .filter((value) => Number.isInteger(value) && value > 0);
}

function resolveLokaliseTargetLocale(targetLocale: string, languages: LokaliseLanguage[]) {
  const normalized = targetLocale.trim().toLowerCase();
  const matched =
    languages.find((language) => language.langIso.trim().toLowerCase() === normalized) ??
    languages.find((language) => {
      const iso = language.langIso.trim().toLowerCase();
      return iso.startsWith(`${normalized}-`) || normalized.startsWith(`${iso}-`);
    });

  if (!matched) {
    throw new LokaliseLiveCatError(
      "lokalise_target_locale_not_found",
      `Target locale "${targetLocale}" was not found in the Lokalise project.`,
    );
  }

  return matched;
}

function lokaliseTranslationIsApproved(translation: LokaliseTranslation | null | undefined) {
  if (!translation?.translation?.trim()) {
    return false;
  }

  return (
    mapLokaliseTranslationReadiness({
      content: translation.translation,
      isUnverified: translation.isUnverified,
      isReviewed: translation.isReviewed,
    }) === "ready"
  );
}

function mapLokaliseTargetTranslation(
  translation: LokaliseTranslation | null | undefined,
): ProjectFileCatTranslation | null {
  if (!translation?.translation?.trim()) {
    return null;
  }

  return {
    text: translation.translation,
    externalTranslationId: String(translation.translationId),
    isApproved: lokaliseTranslationIsApproved(translation),
  };
}

function mapLokaliseKeyComment(comment: LokaliseComment): ProjectFileCatComment {
  return {
    externalCommentId: String(comment.commentId),
    type: "comment",
    status: null,
    text: comment.comment,
    createdAt: comment.addedAt,
    locale: null,
    author: comment.addedByEmail,
  };
}

function segmentMatchesQueueFilter(
  segment: LokaliseCatSegmentDraft,
  filter: ProjectFileCatPaginationInput["queueFilter"],
) {
  const hasComments = segment.comments.length > 0;
  const isApproved = segment.target?.isApproved ?? false;
  const hasTarget = Boolean(segment.target?.text?.trim());

  switch (filter) {
    case "untranslated":
      return !hasTarget;
    case "needs_review":
      return hasTarget && !isApproved;
    case "reviewed":
      return isApproved;
    case "has_issues":
      return hasComments;
    case "all":
    default:
      return true;
  }
}

function segmentMatchesSearch(segment: LokaliseCatSegmentDraft, search: string | undefined) {
  const query = search?.trim().toLowerCase();
  if (!query) {
    return true;
  }

  return (
    segment.key.toLowerCase().includes(query) ||
    segment.sourceText.toLowerCase().includes(query) ||
    (segment.target?.text?.toLowerCase().includes(query) ?? false)
  );
}

async function listKeysByIds(client: LokaliseApiClient, projectId: string, keyIds: number[]) {
  const keysById = new Map<number, LokaliseKey>();
  for (let index = 0; index < keyIds.length; index += KEY_ID_CHUNK_SIZE) {
    const chunk = keyIds.slice(index, index + KEY_ID_CHUNK_SIZE);
    let page: LokaliseKey[];
    try {
      page = await client.listKeys(projectId, {
        includeTranslations: true,
        filterKeyIds: chunk,
      });
    } catch (error) {
      mapLokaliseApiError(error);
    }

    for (const key of page) {
      keysById.set(key.keyId, key);
    }
  }

  return keyIds
    .map((keyId) => keysById.get(keyId))
    .filter((key): key is LokaliseKey => key != null);
}

async function resolveScopedKeys(input: {
  client: LokaliseApiClient;
  projectId: string;
  file: TmsProviderLiveFile;
}) {
  const resourceType = input.file.provider?.resourceType;
  const keyIds = readScopedKeyIds(input.file);

  if (resourceType === "key") {
    if (keyIds.length === 0) {
      return [];
    }

    return listKeysByIds(input.client, input.projectId, keyIds.slice(0, 1));
  }

  if (keyIds.length > 0) {
    return listKeysByIds(input.client, input.projectId, keyIds);
  }

  let keys: LokaliseKey[];
  try {
    keys = await input.client.listKeys(input.projectId, {
      includeTranslations: true,
      maxKeys: legacyProviderCatSegmentLimit + 1,
    });
  } catch (error) {
    mapLokaliseApiError(error);
  }

  return keys;
}

function buildSegmentDrafts(input: {
  keys: LokaliseKey[];
  sourceLocale: string | null;
  targetLocale: string;
}): LokaliseCatSegmentDraft[] {
  return input.keys.map((key) => {
    const keyName = extractLokaliseKeyName(key.keyName);
    const translationsByLocale = new Map(
      key.translations.map((translation) => [translation.languageIso, translation]),
    );
    const sourceTranslation = input.sourceLocale
      ? translationsByLocale.get(input.sourceLocale)
      : null;
    const targetTranslation = translationsByLocale.get(input.targetLocale);

    return {
      externalStringId: String(key.keyId),
      key: keyName,
      sourceText: sourceTranslation?.translation?.trim() || keyName,
      context: key.context ?? key.description,
      type: key.isPlural ? "plural" : null,
      target: mapLokaliseTargetTranslation(targetTranslation),
      comments: [],
    };
  });
}

function buildQueueSummary(segments: LokaliseCatSegmentDraft[]): ProjectFileCatQueueSummary {
  let reviewed = 0;
  let untranslated = 0;
  let needsReview = 0;
  let hasIssues = 0;

  for (const segment of segments) {
    const hasTarget = Boolean(segment.target?.text?.trim());
    const isApproved = segment.target?.isApproved ?? false;
    const hasComments = segment.comments.length > 0;

    if (!hasTarget) {
      untranslated += 1;
    } else if (isApproved) {
      reviewed += 1;
    } else {
      needsReview += 1;
    }

    if (hasComments) {
      hasIssues += 1;
    }
  }

  return {
    total: segments.length,
    reviewed,
    untranslated,
    needsReview,
    hasIssues,
  };
}

export async function buildLokaliseLiveCatFile(input: {
  secretMaterial: string;
  baseUrl?: string | null;
  externalProjectId: string;
  file: TmsProviderLiveFile;
  targetLocale: string;
  canEditTranslations: boolean;
  pagination?: ProjectFileCatPaginationInput;
}): Promise<ProjectFileCatResponse["catFile"]> {
  const projectId = input.externalProjectId.trim();
  if (!projectId) {
    throw new LokaliseLiveCatError(
      "invalid_lokalise_project_id",
      "Lokalise project identifier is invalid.",
    );
  }

  const client = new LokaliseApiClient({
    token: input.secretMaterial,
    baseUrl: input.baseUrl ?? LOKALISE_DEFAULT_BASE_URL,
  });

  let languages: LokaliseLanguage[];
  try {
    languages = await client.listProjectLanguages(projectId);
  } catch (error) {
    mapLokaliseApiError(error);
  }

  const sourceLocale =
    input.file.provider?.sourceLocale?.trim() ||
    languages
      .find((language) => language.langId === readBaseLanguageId(input.file))
      ?.langIso.trim() ||
    null;
  const targetLanguage = resolveLokaliseTargetLocale(input.targetLocale, languages);
  const scopedKeys = await resolveScopedKeys({
    client,
    projectId,
    file: input.file,
  });

  const commentsByKeyId = new Map<number, ProjectFileCatComment[]>();
  await mapWithConcurrency(scopedKeys, COMMENT_FETCH_CONCURRENCY, async (key) => {
    try {
      const comments = await client.listKeyComments(projectId, key.keyId);
      if (comments.length === 0) {
        return;
      }

      commentsByKeyId.set(
        key.keyId,
        comments.map((comment) => mapLokaliseKeyComment(comment)),
      );
    } catch (error) {
      if (error instanceof LokaliseApiError && error.status === 404) {
        return;
      }
      mapLokaliseApiError(error);
    }
  });

  const allSegments = buildSegmentDrafts({
    keys: scopedKeys,
    sourceLocale,
    targetLocale: targetLanguage.langIso,
  }).map((segment) => ({
    ...segment,
    comments: commentsByKeyId.get(Number(segment.externalStringId)) ?? [],
  }));

  const paginationInput = input.pagination ?? {
    offset: 0,
    limit: legacyProviderCatSegmentLimit,
    search: undefined,
    queueFilter: "all",
    paginated: false,
  };

  const queueSummary = buildQueueSummary(allSegments);
  const filteredSegments = allSegments.filter(
    (segment) =>
      segmentMatchesQueueFilter(segment, paginationInput.queueFilter) &&
      segmentMatchesSearch(segment, paginationInput.search),
  );

  if (!paginationInput.paginated) {
    const truncated = filteredSegments.length > legacyProviderCatSegmentLimit;
    const visibleSegments = truncated
      ? filteredSegments.slice(0, legacyProviderCatSegmentLimit)
      : filteredSegments;

    return {
      sourcePath: input.file.sourcePath,
      filename: input.file.filename,
      provider: input.file.provider,
      targetLocale: input.targetLocale,
      canEditTranslations: input.canEditTranslations,
      truncated,
      queueSummary,
      segments: visibleSegments,
    };
  }

  const offset = paginationInput.offset;
  const limit = paginationInput.limit;
  const pageSegments = filteredSegments.slice(offset, offset + limit);
  const pagination = buildCatFilePagination({
    offset,
    limit,
    returnedCount: pageSegments.length,
    totalCount: filteredSegments.length,
    hasMore: offset + pageSegments.length < filteredSegments.length,
  });

  return {
    sourcePath: input.file.sourcePath,
    filename: input.file.filename,
    provider: input.file.provider,
    targetLocale: input.targetLocale,
    canEditTranslations: input.canEditTranslations,
    truncated: pagination.hasMore,
    pagination,
    queueSummary,
    segments: pageSegments,
  };
}

export async function saveLokaliseLiveCatTranslation(input: {
  secretMaterial: string;
  baseUrl?: string | null;
  externalProjectId: string;
  targetLocale: string;
  externalStringId: string;
  text: string;
}): Promise<ProjectFileCatTranslation> {
  const projectId = input.externalProjectId.trim();
  if (!projectId) {
    throw new LokaliseLiveCatError(
      "invalid_lokalise_project_id",
      "Lokalise project identifier is invalid.",
    );
  }

  const keyId = parseLokaliseKeyId(input.externalStringId);
  if (keyId == null) {
    throw new LokaliseLiveCatError(
      "invalid_lokalise_key_id",
      "Lokalise key identifier is invalid.",
    );
  }

  const client = new LokaliseApiClient({
    token: input.secretMaterial,
    baseUrl: input.baseUrl ?? LOKALISE_DEFAULT_BASE_URL,
  });

  let languages: LokaliseLanguage[];
  try {
    languages = await client.listProjectLanguages(projectId);
  } catch (error) {
    mapLokaliseApiError(error);
  }

  const targetLanguage = resolveLokaliseTargetLocale(input.targetLocale, languages);

  try {
    await client.bulkUpdateKeys(projectId, [
      {
        keyId,
        translations: [
          {
            languageIso: targetLanguage.langIso,
            translation: input.text,
            isUnverified: false,
            isReviewed: true,
          },
        ],
      },
    ]);
  } catch (error) {
    mapLokaliseApiError(error);
  }

  return {
    text: input.text,
    externalTranslationId: null,
    isApproved: true,
  };
}

export async function saveLokaliseLiveCatComment(input: {
  secretMaterial: string;
  baseUrl?: string | null;
  externalProjectId: string;
  targetLocale: string;
  externalStringId: string;
  text: string;
}): Promise<ProjectFileCatComment> {
  const projectId = input.externalProjectId.trim();
  if (!projectId) {
    throw new LokaliseLiveCatError(
      "invalid_lokalise_project_id",
      "Lokalise project identifier is invalid.",
    );
  }

  const keyId = parseLokaliseKeyId(input.externalStringId);
  if (keyId == null) {
    throw new LokaliseLiveCatError(
      "invalid_lokalise_key_id",
      "Lokalise key identifier is invalid.",
    );
  }

  const client = new LokaliseApiClient({
    token: input.secretMaterial,
    baseUrl: input.baseUrl ?? LOKALISE_DEFAULT_BASE_URL,
  });

  let created: LokaliseComment[];
  try {
    created = await client.createKeyComments(projectId, keyId, [{ comment: input.text }]);
  } catch (error) {
    mapLokaliseApiError(error);
  }

  const comment = created[0];
  if (!comment) {
    throw new LokaliseLiveCatError(
      "lokalise_comment_create_failed",
      "Lokalise did not return the created comment.",
    );
  }

  return mapLokaliseKeyComment(comment);
}

function readBaseLanguageId(file: TmsProviderLiveFile) {
  const payload = file.metadata ?? {};
  return typeof payload.baseLanguageId === "number" ? payload.baseLanguageId : null;
}
