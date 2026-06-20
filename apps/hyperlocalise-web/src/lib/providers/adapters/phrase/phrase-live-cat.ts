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
  PhraseApiError,
  type PhraseKey,
  type PhraseLocale,
  type PhraseTranslation,
} from "./phrase-api";
import {
  matchPhraseTargetLocale,
  resolvePhraseBranch,
  resolvePhraseStringsProjectId,
} from "./phrase-job-context";
import {
  mapPhraseTranslationReadiness,
  parsePhraseExternalResourceId,
} from "./phrase-locale-readiness";
import { createPhraseStringsApiClient } from "./phrase-strings-client";

const LOCALE_FETCH_CONCURRENCY = 8;
const COMMENT_FETCH_CONCURRENCY = 8;

export class PhraseLiveCatError extends Error {
  constructor(
    readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "PhraseLiveCatError";
  }
}

type PhraseLiveCatContext = {
  token: string;
  region?: string | null;
  baseUrl?: string | null;
  stringsProjectId: string;
  branch: string | null;
};

type PhraseCatSegmentDraft = {
  externalStringId: string;
  key: string;
  sourceText: string;
  context: string | null;
  type: string | null;
  target: ProjectFileCatTranslation | null;
  comments: ProjectFileCatComment[];
};

function mapPhraseApiError(error: unknown): never {
  if (error instanceof PhraseApiError && error.status === 401) {
    throw new PhraseLiveCatError("phrase_auth_invalid", "Phrase credentials are invalid.");
  }
  throw error;
}

function readFileMetadata(file: TmsProviderLiveFile) {
  const payload = file.metadata ?? {};
  const branch =
    typeof payload.branch === "string" && payload.branch.trim() ? payload.branch.trim() : null;
  const tags = Array.isArray(payload.tags)
    ? payload.tags.filter((tag): tag is string => typeof tag === "string" && tag.trim().length > 0)
    : [];

  return { branch, tags };
}

function resolvePhraseLiveCatContext(input: {
  file: TmsProviderLiveFile;
  externalProjectId: string;
  secretMaterial: string;
  region?: string | null;
  baseUrl?: string | null;
}): PhraseLiveCatContext {
  const stringsProjectId = resolvePhraseStringsProjectId(
    { providerMetadata: {} },
    input.externalProjectId,
  );
  if (!stringsProjectId) {
    throw new PhraseLiveCatError(
      "invalid_phrase_project_id",
      "Phrase project identifier is invalid.",
    );
  }

  const metadata = readFileMetadata(input.file);
  const parsedResource = parsePhraseExternalResourceId(
    input.file.provider?.externalResourceId ?? "",
  );

  return {
    token: input.secretMaterial,
    region: input.region,
    baseUrl: input.baseUrl,
    stringsProjectId,
    branch:
      metadata.branch ?? parsedResource.branch ?? resolvePhraseBranch({ providerMetadata: {} }),
  };
}

function phraseTranslationIsApproved(translation: PhraseTranslation | null | undefined) {
  if (!translation) {
    return false;
  }

  return (
    mapPhraseTranslationReadiness({
      content: translation.content,
      state: translation.state,
      unverified: translation.unverified,
      excluded: translation.excluded,
    }) === "ready"
  );
}

function mapPhraseTargetTranslation(
  translation: PhraseTranslation | null | undefined,
): ProjectFileCatTranslation | null {
  if (!translation?.content?.trim()) {
    return null;
  }

  return {
    text: translation.content,
    externalTranslationId: translation.id,
    isApproved: phraseTranslationIsApproved(translation),
  };
}

function mapPhraseKeyComment(
  comment: {
    id: string;
    message: string;
    createdAt: string | null;
    updatedAt: string | null;
    user: { username: string | null; name: string | null } | null;
    locales: Array<{ name: string; code: string | null }>;
  },
  targetLocale: string,
): ProjectFileCatComment {
  const locale =
    comment.locales[0]?.code?.trim() || comment.locales[0]?.name?.trim() || targetLocale || null;

  return {
    externalCommentId: comment.id,
    type: "comment",
    status: null,
    text: comment.message,
    createdAt: comment.createdAt ?? comment.updatedAt ?? new Date().toISOString(),
    locale,
    author: comment.user?.name ?? comment.user?.username ?? null,
  };
}

function segmentMatchesQueueFilter(
  segment: PhraseCatSegmentDraft,
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

function segmentMatchesSearch(segment: PhraseCatSegmentDraft, search: string | undefined) {
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

async function loadTranslationsByKeyId(input: {
  client: ReturnType<typeof createPhraseStringsApiClient>;
  projectId: string;
  locales: PhraseLocale[];
  branch: string | null;
  keyIds: Set<string>;
}) {
  const translationsByKeyId = new Map<string, Map<string, PhraseTranslation>>();
  const listOptions = input.branch ? { branch: input.branch } : {};

  await mapWithConcurrency(input.locales, LOCALE_FETCH_CONCURRENCY, async (locale) => {
    try {
      const translations = await input.client.listTranslations(
        input.projectId,
        locale.name,
        listOptions,
      );

      for (const translation of translations) {
        if (!translation.keyId || !input.keyIds.has(translation.keyId)) {
          continue;
        }

        const byLocale =
          translationsByKeyId.get(translation.keyId) ?? new Map<string, PhraseTranslation>();
        byLocale.set(locale.name, translation);
        translationsByKeyId.set(translation.keyId, byLocale);
      }
    } catch (error) {
      mapPhraseApiError(error);
    }
  });

  return translationsByKeyId;
}

async function resolveScopedKeys(input: {
  client: ReturnType<typeof createPhraseStringsApiClient>;
  stringsProjectId: string;
  branch: string | null;
  file: TmsProviderLiveFile;
}) {
  const listOptions = input.branch ? { branch: input.branch } : {};
  const resourceType = input.file.provider?.resourceType;
  const parsedResource = parsePhraseExternalResourceId(
    input.file.provider?.externalResourceId ?? "",
  );
  const metadata = readFileMetadata(input.file);

  if (resourceType === "key") {
    const key =
      (await input.client.getKey(input.stringsProjectId, parsedResource.resourceId, listOptions)) ??
      null;
    return key ? [key] : [];
  }

  let keys: PhraseKey[];
  try {
    keys = await input.client.listKeys(input.stringsProjectId, listOptions);
  } catch (error) {
    mapPhraseApiError(error);
  }

  if (metadata.tags.length === 0) {
    return keys;
  }

  return keys.filter((key) => key.tags.some((tag) => metadata.tags.includes(tag)));
}

function buildSegmentDrafts(input: {
  keys: PhraseKey[];
  sourceLocale: PhraseLocale | null;
  targetLocale: PhraseLocale;
  targetLocaleCode: string;
  translationsByKeyId: Map<string, Map<string, PhraseTranslation>>;
  commentsByKeyId: Map<string, ProjectFileCatComment[]>;
}): PhraseCatSegmentDraft[] {
  return input.keys.map((key) => {
    const translationsByLocale = input.translationsByKeyId.get(key.id);
    const sourceTranslation = input.sourceLocale
      ? translationsByLocale?.get(input.sourceLocale.name)
      : null;
    const targetTranslation = translationsByLocale?.get(input.targetLocale.name);

    return {
      externalStringId: key.id,
      key: key.name,
      sourceText: sourceTranslation?.content?.trim() || key.name,
      context: key.description,
      type: key.dataType,
      target: mapPhraseTargetTranslation(targetTranslation),
      comments: input.commentsByKeyId.get(key.id) ?? [],
    };
  });
}

function buildQueueSummary(segments: PhraseCatSegmentDraft[]): ProjectFileCatQueueSummary {
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

export async function buildPhraseLiveCatFile(input: {
  secretMaterial: string;
  region?: string | null;
  baseUrl?: string | null;
  externalProjectId: string;
  file: TmsProviderLiveFile;
  targetLocale: string;
  canEditTranslations: boolean;
  pagination?: ProjectFileCatPaginationInput;
}): Promise<ProjectFileCatResponse["catFile"]> {
  const scope = resolvePhraseLiveCatContext({
    file: input.file,
    externalProjectId: input.externalProjectId,
    secretMaterial: input.secretMaterial,
    region: input.region,
    baseUrl: input.baseUrl,
  });
  const client = createPhraseStringsApiClient({
    token: scope.token,
    region: scope.region,
    baseUrl: scope.baseUrl,
  });
  const listOptions = scope.branch ? { branch: scope.branch } : {};

  let locales: PhraseLocale[];
  try {
    locales = await client.listLocales(scope.stringsProjectId, listOptions);
  } catch (error) {
    mapPhraseApiError(error);
  }

  const sourceLocale = locales.find((locale) => locale.default) ?? null;
  const targetLocale =
    matchPhraseTargetLocale(input.targetLocale, locales) ??
    locales.find((locale) => !locale.default);
  if (!targetLocale) {
    throw new PhraseLiveCatError(
      "phrase_target_locale_not_found",
      "Target locale was not found in the Phrase project.",
    );
  }

  const scopedKeys = await resolveScopedKeys({
    client,
    stringsProjectId: scope.stringsProjectId,
    branch: scope.branch,
    file: input.file,
  });
  const keyIds = new Set(scopedKeys.map((key) => key.id));
  const localesToLoad = [sourceLocale, targetLocale].filter(
    (locale): locale is PhraseLocale => locale != null,
  );

  const translationsByKeyId = await loadTranslationsByKeyId({
    client,
    projectId: scope.stringsProjectId,
    locales: localesToLoad,
    branch: scope.branch,
    keyIds,
  });

  const commentsByKeyId = new Map<string, ProjectFileCatComment[]>();
  await mapWithConcurrency(scopedKeys, COMMENT_FETCH_CONCURRENCY, async (key) => {
    try {
      const comments = await client.listKeyComments(scope.stringsProjectId, key.id, listOptions);
      if (comments.length === 0) {
        return;
      }

      commentsByKeyId.set(
        key.id,
        comments.map((comment) => mapPhraseKeyComment(comment, input.targetLocale)),
      );
    } catch (error) {
      if (error instanceof PhraseApiError && error.status === 404) {
        return;
      }
      mapPhraseApiError(error);
    }
  });

  const allSegments = buildSegmentDrafts({
    keys: scopedKeys,
    sourceLocale,
    targetLocale,
    targetLocaleCode: input.targetLocale,
    translationsByKeyId,
    commentsByKeyId,
  });

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

export async function savePhraseLiveCatTranslation(input: {
  secretMaterial: string;
  region?: string | null;
  baseUrl?: string | null;
  externalProjectId: string;
  file: TmsProviderLiveFile;
  targetLocale: string;
  externalStringId: string;
  text: string;
}): Promise<ProjectFileCatTranslation> {
  const scope = resolvePhraseLiveCatContext({
    file: input.file,
    externalProjectId: input.externalProjectId,
    secretMaterial: input.secretMaterial,
    region: input.region,
    baseUrl: input.baseUrl,
  });
  const client = createPhraseStringsApiClient({
    token: scope.token,
    region: scope.region,
    baseUrl: scope.baseUrl,
  });
  const listOptions = scope.branch ? { branch: scope.branch } : {};

  let locales: PhraseLocale[];
  try {
    locales = await client.listLocales(scope.stringsProjectId, listOptions);
  } catch (error) {
    mapPhraseApiError(error);
  }

  const targetLocale =
    matchPhraseTargetLocale(input.targetLocale, locales) ??
    locales.find((locale) => !locale.default);
  if (!targetLocale) {
    throw new PhraseLiveCatError(
      "phrase_target_locale_not_found",
      "Target locale was not found in the Phrase project.",
    );
  }

  let saved: PhraseTranslation;
  try {
    saved = await client.upsertTranslation(scope.stringsProjectId, {
      keyId: input.externalStringId,
      localeName: targetLocale.name,
      content: input.text,
      branch: scope.branch,
      unverified: false,
    });
  } catch (error) {
    mapPhraseApiError(error);
  }

  return {
    text: saved.content?.trim() || input.text,
    externalTranslationId: saved.id,
    isApproved: phraseTranslationIsApproved(saved),
  };
}

export async function savePhraseLiveCatComment(input: {
  secretMaterial: string;
  region?: string | null;
  baseUrl?: string | null;
  externalProjectId: string;
  file: TmsProviderLiveFile;
  targetLocale: string;
  externalStringId: string;
  text: string;
}): Promise<ProjectFileCatComment> {
  const scope = resolvePhraseLiveCatContext({
    file: input.file,
    externalProjectId: input.externalProjectId,
    secretMaterial: input.secretMaterial,
    region: input.region,
    baseUrl: input.baseUrl,
  });
  const client = createPhraseStringsApiClient({
    token: scope.token,
    region: scope.region,
    baseUrl: scope.baseUrl,
  });
  const listOptions = scope.branch ? { branch: scope.branch } : {};

  let created;
  try {
    created = await client.createKeyComment(
      scope.stringsProjectId,
      input.externalStringId,
      {
        message: input.text,
        localeName: input.targetLocale,
      },
      listOptions,
    );
  } catch (error) {
    mapPhraseApiError(error);
  }

  return mapPhraseKeyComment(created, input.targetLocale);
}
