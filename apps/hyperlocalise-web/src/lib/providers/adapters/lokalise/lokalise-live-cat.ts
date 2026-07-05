import type {
  ProjectFileCatComment,
  ProjectFileCatQueueFile,
  ProjectFileCatQueueSegment,
  ProjectFileCatTranslation,
} from "@/api/routes/project/project.schema";
import { legacyProviderCatSegmentLimit } from "@/api/routes/project/project.schema";
import {
  buildCatFilePagination,
  type ProjectFileCatPaginationInput,
} from "@/lib/projects/cat/project-file-cat-pagination";
import type { TmsProviderLiveFile } from "@/lib/providers/tms-provider-live";

import {
  extractLokaliseKeyName,
  LokaliseApiClient,
  LokaliseApiError,
  type LokaliseKey,
  type LokaliseLanguage,
  type LokaliseTranslation,
} from "./lokalise-api";
import { mapLokaliseTranslationReadiness } from "./lokalise-locale-readiness";
import { pickLokaliseKeyTranslation } from "./normalize-lokalise-context-matches";

const LOKALISE_KEY_FETCH_CHUNK_SIZE = 50;
const LOKALISE_QUEUE_SCAN_PAGE_SIZE = 100;
const LOKALISE_MAX_SCAN_PAGES = 50;

export class LokaliseLiveCatError extends Error {
  constructor(
    readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "LokaliseLiveCatError";
  }
}

type LokaliseLiveCatContext = {
  token: string;
  baseUrl?: string | null;
  projectId: string;
};

type LokaliseQueueSegmentDraft = {
  externalStringId: string;
  key: string;
  sourceText: string;
  context: string | null;
  type: string | null;
};

function mapLokaliseApiError(error: unknown): never {
  if (error instanceof LokaliseApiError && (error.status === 401 || error.status === 403)) {
    throw new LokaliseLiveCatError(
      "lokalise_auth_invalid",
      "Lokalise credentials are invalid or lack permission for this project.",
    );
  }
  throw error;
}

function readFileMetadata(file: TmsProviderLiveFile) {
  const payload = file.metadata ?? {};
  const tags = Array.isArray(payload.tags)
    ? payload.tags.filter((tag): tag is string => typeof tag === "string" && tag.trim().length > 0)
    : [];
  const keyIds = Array.isArray(payload.keyIds)
    ? payload.keyIds
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0)
    : [];

  return { tags, keyIds };
}

function resolveLokaliseLiveCatContext(input: {
  file: TmsProviderLiveFile;
  externalProjectId: string;
  secretMaterial: string;
  baseUrl?: string | null;
}): LokaliseLiveCatContext {
  const projectId = input.externalProjectId.trim();
  if (!projectId) {
    throw new LokaliseLiveCatError(
      "invalid_lokalise_project_id",
      "Lokalise project identifier is invalid.",
    );
  }

  return {
    token: input.secretMaterial,
    baseUrl: input.baseUrl,
    projectId,
  };
}

function buildQueueSegmentFromKey(
  key: LokaliseKey,
  sourceLocale: string | null,
): LokaliseQueueSegmentDraft {
  const keyName = extractLokaliseKeyName(key.keyName);
  const sourceTranslation = sourceLocale ? pickLokaliseKeyTranslation(key, sourceLocale) : null;
  const sourceText = sourceTranslation?.translation.trim() || keyName;

  return {
    externalStringId: String(key.keyId),
    key: keyName,
    sourceText,
    context: key.context ?? key.description,
    type: key.isPlural ? "plural" : null,
  };
}

function draftToQueueSegment(draft: LokaliseQueueSegmentDraft): ProjectFileCatQueueSegment {
  return {
    externalStringId: draft.externalStringId,
    key: draft.key,
    sourceText: draft.sourceText,
    context: draft.context,
    type: draft.type,
  };
}

function segmentMatchesSearch(segment: LokaliseQueueSegmentDraft, search: string | undefined) {
  const query = search?.trim().toLowerCase();
  if (!query) {
    return true;
  }

  return (
    segment.key.toLowerCase().includes(query) ||
    segment.sourceText.toLowerCase().includes(query) ||
    (segment.context?.toLowerCase().includes(query) ?? false)
  );
}

function filterKeysByFileTags(keys: LokaliseKey[], tags: string[]) {
  if (tags.length === 0) {
    return keys;
  }

  return keys.filter((key) => key.tags.some((tag) => tags.includes(tag)));
}

function lokaliseTranslationIsApproved(translation: LokaliseTranslation | null | undefined) {
  if (!translation) {
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

function resolveLokaliseTargetLocale(
  targetLocale: string,
  languages: LokaliseLanguage[],
): LokaliseLanguage {
  const normalized = targetLocale.trim().toLowerCase();
  const matched =
    languages.find((language) => language.langIso.trim().toLowerCase() === normalized) ?? null;
  if (!matched) {
    throw new LokaliseLiveCatError(
      "lokalise_target_locale_not_found",
      `Target locale "${targetLocale}" was not found in the Lokalise project.`,
    );
  }

  return matched;
}

function mapLokaliseKeyComment(comment: {
  commentId: number;
  comment: string;
  addedAt: string | null;
  addedByEmail: string | null;
}): ProjectFileCatComment {
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

async function fetchLokaliseKeysByIds(input: {
  client: LokaliseApiClient;
  projectId: string;
  keyIds: number[];
}): Promise<LokaliseKey[]> {
  if (input.keyIds.length === 0) {
    return [];
  }

  const keys: LokaliseKey[] = [];
  for (let index = 0; index < input.keyIds.length; index += LOKALISE_KEY_FETCH_CHUNK_SIZE) {
    const chunk = input.keyIds.slice(index, index + LOKALISE_KEY_FETCH_CHUNK_SIZE);
    try {
      const pageKeys = await input.client.listKeys(input.projectId, {
        includeTranslations: true,
        filterKeyIds: chunk,
      });
      keys.push(...pageKeys);
    } catch (error) {
      mapLokaliseApiError(error);
    }
  }

  return keys;
}

async function advanceLokaliseKeysCursor(input: {
  client: LokaliseApiClient;
  projectId: string;
  targetScanPage: number;
  pageSize: number;
}): Promise<{ cursor: string; scanComplete: boolean }> {
  let cursor = "";
  for (let page = 1; page < input.targetScanPage; page++) {
    const result = await input.client.listKeysCursorPage(input.projectId, {
      includeTranslations: false,
      cursor: cursor || undefined,
      limit: input.pageSize,
    });
    if (!result.nextCursor) {
      return { cursor: "", scanComplete: true };
    }
    cursor = result.nextCursor;
  }

  return { cursor, scanComplete: false };
}

async function loadLokaliseQueuePage(input: {
  client: LokaliseApiClient;
  scope: LokaliseLiveCatContext;
  file: TmsProviderLiveFile;
  paginationInput: ProjectFileCatPaginationInput;
}): Promise<{
  segments: ProjectFileCatQueueSegment[];
  hasMore: boolean;
  nextPhraseScanPage?: number;
  nextPhraseScanSkip?: number;
}> {
  const metadata = readFileMetadata(input.file);
  const resourceType = input.file.provider?.resourceType;
  const sourceLocale = input.file.provider?.sourceLocale ?? null;
  const { offset, limit, search, queueFilter } = input.paginationInput;

  if (queueFilter === "has_issues") {
    throw new LokaliseLiveCatError(
      "lokalise_cat_queue_filter_unsupported",
      "Lokalise does not support filtering the CAT queue by issues.",
    );
  }

  if (resourceType === "key") {
    const keyId = Number(input.file.provider?.externalResourceId);
    if (!Number.isFinite(keyId) || keyId <= 0) {
      return { segments: [], hasMore: false };
    }

    let keys: LokaliseKey[];
    try {
      keys = await fetchLokaliseKeysByIds({
        client: input.client,
        projectId: input.scope.projectId,
        keyIds: [keyId],
      });
    } catch (error) {
      if (error instanceof LokaliseApiError && error.status === 404) {
        return { segments: [], hasMore: false };
      }
      mapLokaliseApiError(error);
    }

    const segments = keys
      .map((key) => buildQueueSegmentFromKey(key, sourceLocale))
      .filter((segment) => segmentMatchesSearch(segment, search))
      .slice(offset, offset + limit)
      .map(draftToQueueSegment);

    return {
      segments,
      hasMore: false,
    };
  }

  const scopedKeyIds = metadata.keyIds;
  const needsClientSideFilter = Boolean(search?.trim()) || metadata.tags.length > 0;

  if (!needsClientSideFilter && scopedKeyIds.length > 0) {
    const pageKeyIds = scopedKeyIds.slice(offset, offset + limit);
    const keys = await fetchLokaliseKeysByIds({
      client: input.client,
      projectId: input.scope.projectId,
      keyIds: pageKeyIds,
    });
    const keysById = new Map(keys.map((key) => [key.keyId, key]));
    const segments = pageKeyIds
      .map((keyId) => keysById.get(keyId))
      .filter((key): key is LokaliseKey => key != null)
      .map((key) => buildQueueSegmentFromKey(key, sourceLocale))
      .map(draftToQueueSegment);

    return {
      segments,
      hasMore: offset + limit < scopedKeyIds.length,
    };
  }

  if (!needsClientSideFilter && scopedKeyIds.length === 0) {
    const collected: LokaliseKey[] = [];
    let cursor = "";
    let skipped = 0;
    let hasMore = false;

    while (collected.length < limit) {
      const page = await input.client.listKeysCursorPage(input.scope.projectId, {
        includeTranslations: false,
        cursor: cursor || undefined,
        limit: LOKALISE_QUEUE_SCAN_PAGE_SIZE,
      });

      let stoppedEarly = false;
      for (const key of page.keys) {
        if (skipped < offset) {
          skipped += 1;
          continue;
        }

        collected.push(key);
        if (collected.length >= limit) {
          stoppedEarly = true;
          break;
        }
      }

      if (collected.length >= limit) {
        hasMore = Boolean(page.nextCursor) || stoppedEarly;
        break;
      }

      if (!page.nextCursor) {
        break;
      }

      cursor = page.nextCursor;
    }

    return {
      segments: collected
        .map((key) => buildQueueSegmentFromKey(key, sourceLocale))
        .map(draftToQueueSegment),
      hasMore,
    };
  }

  const collected: ProjectFileCatQueueSegment[] = [];
  const resumingScan = input.paginationInput.phraseScanPage != null;
  let scanPage = resumingScan ? input.paginationInput.phraseScanPage! : 1;
  let skipMatches = resumingScan ? (input.paginationInput.phraseScanSkip ?? 0) : offset;
  let scanComplete = false;
  let nextPhraseScanPage: number | undefined;
  let nextPhraseScanSkip: number | undefined;
  let listKeysCursor = "";
  if (resumingScan && scopedKeyIds.length === 0) {
    const advanced = await advanceLokaliseKeysCursor({
      client: input.client,
      projectId: input.scope.projectId,
      targetScanPage: scanPage,
      pageSize: LOKALISE_QUEUE_SCAN_PAGE_SIZE,
    });
    if (advanced.scanComplete) {
      scanComplete = true;
    } else {
      listKeysCursor = advanced.cursor;
    }
  }
  const scanPageBudget = resumingScan
    ? scanPage + LOKALISE_MAX_SCAN_PAGES - 1
    : Math.max(
        LOKALISE_MAX_SCAN_PAGES,
        Math.ceil((offset + limit) / LOKALISE_QUEUE_SCAN_PAGE_SIZE) + LOKALISE_MAX_SCAN_PAGES,
      );

  while (!scanComplete && collected.length < limit && scanPage <= scanPageBudget) {
    const chunkStart = (scanPage - 1) * LOKALISE_QUEUE_SCAN_PAGE_SIZE;
    const chunkKeyIds =
      scopedKeyIds.length > 0
        ? scopedKeyIds.slice(chunkStart, chunkStart + LOKALISE_QUEUE_SCAN_PAGE_SIZE)
        : null;

    let keys: LokaliseKey[];
    if (chunkKeyIds != null) {
      if (chunkKeyIds.length === 0) {
        scanComplete = true;
        break;
      }
      keys = await fetchLokaliseKeysByIds({
        client: input.client,
        projectId: input.scope.projectId,
        keyIds: chunkKeyIds,
      });
    } else {
      try {
        const page = await input.client.listKeysCursorPage(input.scope.projectId, {
          includeTranslations: false,
          cursor: listKeysCursor || undefined,
          limit: LOKALISE_QUEUE_SCAN_PAGE_SIZE,
        });
        keys = page.keys;
        listKeysCursor = page.nextCursor ?? "";
        if (!page.nextCursor) {
          scanComplete = true;
        }
      } catch (error) {
        mapLokaliseApiError(error);
      }
    }

    const filteredKeys = filterKeysByFileTags(keys, metadata.tags);
    const drafts = filteredKeys.map((key) => buildQueueSegmentFromKey(key, sourceLocale));

    let matchesSeenOnPage = 0;
    for (const draft of drafts) {
      if (!segmentMatchesSearch(draft, search)) {
        continue;
      }

      matchesSeenOnPage += 1;
      if (skipMatches > 0) {
        skipMatches -= 1;
        continue;
      }

      collected.push(draftToQueueSegment(draft));
      if (collected.length >= limit) {
        nextPhraseScanPage = scanPage;
        nextPhraseScanSkip = matchesSeenOnPage;
        break;
      }
    }

    if (collected.length >= limit) {
      break;
    }

    if (chunkKeyIds != null) {
      if (chunkStart + LOKALISE_QUEUE_SCAN_PAGE_SIZE >= scopedKeyIds.length) {
        scanComplete = true;
        break;
      }
    } else if (scanComplete) {
      break;
    }

    scanPage += 1;
    skipMatches = 0;
  }

  return {
    segments: collected,
    hasMore: collected.length >= limit && !scanComplete,
    nextPhraseScanPage,
    nextPhraseScanSkip,
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
}): Promise<ProjectFileCatQueueFile> {
  const scope = resolveLokaliseLiveCatContext({
    file: input.file,
    externalProjectId: input.externalProjectId,
    secretMaterial: input.secretMaterial,
    baseUrl: input.baseUrl,
  });
  const client = new LokaliseApiClient({
    token: scope.token,
    baseUrl: scope.baseUrl,
  });

  let languages: LokaliseLanguage[];
  try {
    languages = await client.listProjectLanguages(scope.projectId);
  } catch (error) {
    mapLokaliseApiError(error);
  }

  resolveLokaliseTargetLocale(input.targetLocale, languages);

  const paginationInput = input.pagination ?? {
    offset: 0,
    limit: legacyProviderCatSegmentLimit,
    search: undefined,
    queueFilter: "all",
    paginated: true,
  };

  const { segments, hasMore, nextPhraseScanPage, nextPhraseScanSkip } = await loadLokaliseQueuePage(
    {
      client,
      scope,
      file: input.file,
      paginationInput,
    },
  );

  const pagination = buildCatFilePagination({
    offset: paginationInput.offset,
    limit: paginationInput.limit,
    returnedCount: segments.length,
    totalCount: hasMore
      ? paginationInput.offset + segments.length + 1
      : paginationInput.offset + segments.length,
    hasMore,
    nextPhraseScanPage,
    nextPhraseScanSkip,
  });

  return {
    sourcePath: input.file.sourcePath,
    filename: input.file.filename,
    provider: input.file.provider,
    targetLocale: input.targetLocale,
    canEditTranslations: input.canEditTranslations,
    truncated: pagination.hasMore,
    pagination,
    segments,
  };
}

export async function getLokaliseLiveCatSegmentTarget(input: {
  secretMaterial: string;
  baseUrl?: string | null;
  externalProjectId: string;
  file: TmsProviderLiveFile;
  targetLocale: string;
  externalStringId: string;
}): Promise<ProjectFileCatTranslation | null | "not_found"> {
  const scope = resolveLokaliseLiveCatContext({
    file: input.file,
    externalProjectId: input.externalProjectId,
    secretMaterial: input.secretMaterial,
    baseUrl: input.baseUrl,
  });
  const client = new LokaliseApiClient({
    token: scope.token,
    baseUrl: scope.baseUrl,
  });

  let languages: LokaliseLanguage[];
  try {
    languages = await client.listProjectLanguages(scope.projectId);
  } catch (error) {
    mapLokaliseApiError(error);
  }

  const targetLocale = resolveLokaliseTargetLocale(input.targetLocale, languages);
  const keyId = Number(input.externalStringId);
  if (!Number.isFinite(keyId) || keyId <= 0) {
    return "not_found";
  }

  let keys: LokaliseKey[];
  try {
    keys = await fetchLokaliseKeysByIds({
      client,
      projectId: scope.projectId,
      keyIds: [keyId],
    });
  } catch (error) {
    if (error instanceof LokaliseApiError && error.status === 404) {
      return "not_found";
    }
    mapLokaliseApiError(error);
  }

  const key = keys[0];
  if (!key) {
    return "not_found";
  }

  const translation = pickLokaliseKeyTranslation(key, targetLocale.langIso);
  return mapLokaliseTargetTranslation(translation);
}

export async function getLokaliseLiveCatSegmentComments(input: {
  secretMaterial: string;
  baseUrl?: string | null;
  externalProjectId: string;
  file: TmsProviderLiveFile;
  targetLocale: string;
  externalStringId: string;
}): Promise<ProjectFileCatComment[]> {
  const scope = resolveLokaliseLiveCatContext({
    file: input.file,
    externalProjectId: input.externalProjectId,
    secretMaterial: input.secretMaterial,
    baseUrl: input.baseUrl,
  });
  const client = new LokaliseApiClient({
    token: scope.token,
    baseUrl: scope.baseUrl,
  });

  const keyId = Number(input.externalStringId);
  if (!Number.isFinite(keyId) || keyId <= 0) {
    return [];
  }

  try {
    const comments = await client.listKeyComments(scope.projectId, keyId);
    return comments.map((comment) => mapLokaliseKeyComment(comment));
  } catch (error) {
    if (error instanceof LokaliseApiError && error.status === 404) {
      return [];
    }
    mapLokaliseApiError(error);
  }
}

export async function saveLokaliseLiveCatTranslation(input: {
  secretMaterial: string;
  baseUrl?: string | null;
  externalProjectId: string;
  file: TmsProviderLiveFile;
  targetLocale: string;
  externalStringId: string;
  text: string;
}): Promise<ProjectFileCatTranslation> {
  const scope = resolveLokaliseLiveCatContext({
    file: input.file,
    externalProjectId: input.externalProjectId,
    secretMaterial: input.secretMaterial,
    baseUrl: input.baseUrl,
  });
  const client = new LokaliseApiClient({
    token: scope.token,
    baseUrl: scope.baseUrl,
  });

  let languages: LokaliseLanguage[];
  try {
    languages = await client.listProjectLanguages(scope.projectId);
  } catch (error) {
    mapLokaliseApiError(error);
  }

  const targetLocale = resolveLokaliseTargetLocale(input.targetLocale, languages);
  const keyId = Number(input.externalStringId);
  if (!Number.isFinite(keyId) || keyId <= 0) {
    throw new LokaliseLiveCatError(
      "invalid_lokalise_key_id",
      "Lokalise key identifier is invalid.",
    );
  }

  try {
    await client.bulkUpdateKeys(scope.projectId, [
      {
        keyId,
        translations: [
          {
            languageIso: targetLocale.langIso,
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

  const keys = await fetchLokaliseKeysByIds({
    client,
    projectId: scope.projectId,
    keyIds: [keyId],
  });
  const savedTranslation = pickLokaliseKeyTranslation(keys[0], targetLocale.langIso);

  return {
    text: savedTranslation?.translation.trim() || input.text,
    externalTranslationId: savedTranslation
      ? String(savedTranslation.translationId)
      : `${keyId}:${targetLocale.langIso}`,
    isApproved: lokaliseTranslationIsApproved(savedTranslation),
  };
}

export async function saveLokaliseLiveCatComment(input: {
  secretMaterial: string;
  baseUrl?: string | null;
  externalProjectId: string;
  file: TmsProviderLiveFile;
  targetLocale: string;
  externalStringId: string;
  text: string;
}): Promise<ProjectFileCatComment> {
  const scope = resolveLokaliseLiveCatContext({
    file: input.file,
    externalProjectId: input.externalProjectId,
    secretMaterial: input.secretMaterial,
    baseUrl: input.baseUrl,
  });
  const client = new LokaliseApiClient({
    token: scope.token,
    baseUrl: scope.baseUrl,
  });

  const keyId = Number(input.externalStringId);
  if (!Number.isFinite(keyId) || keyId <= 0) {
    throw new LokaliseLiveCatError(
      "invalid_lokalise_key_id",
      "Lokalise key identifier is invalid.",
    );
  }

  let created: Awaited<ReturnType<typeof client.createKeyComments>>;
  try {
    created = await client.createKeyComments(scope.projectId, keyId, [{ comment: input.text }]);
  } catch (error) {
    mapLokaliseApiError(error);
  }

  const comment = created[0];
  if (!comment) {
    throw new LokaliseLiveCatError(
      "lokalise_provider_comment_create_failed",
      "Lokalise did not return the created comment.",
    );
  }

  return mapLokaliseKeyComment(comment);
}
