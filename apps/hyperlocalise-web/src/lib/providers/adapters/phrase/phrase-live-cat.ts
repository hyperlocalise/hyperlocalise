import type {
  ProjectFileCatComment,
  ProjectFileCatResponse,
  ProjectFileCatSegment,
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

function resolvePhraseTargetLocale(targetLocale: string, locales: PhraseLocale[]): PhraseLocale {
  const matched = matchPhraseTargetLocale(targetLocale, locales);
  if (!matched) {
    throw new PhraseLiveCatError(
      "phrase_target_locale_not_found",
      `Target locale "${targetLocale}" was not found in the Phrase project.`,
    );
  }

  return matched;
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
    createdAt: comment.createdAt ?? comment.updatedAt ?? null,
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
  localeNames: Set<string>;
  branch: string | null;
  keyIds: string[];
}) {
  const translationsByKeyId = new Map<string, Map<string, PhraseTranslation>>();
  const listOptions = input.branch ? { branch: input.branch } : {};
  if (input.keyIds.length === 0) {
    return translationsByKeyId;
  }

  await mapWithConcurrency(input.keyIds, LOCALE_FETCH_CONCURRENCY, async (keyId) => {
    try {
      const translations = await input.client.listKeyTranslations(
        input.projectId,
        keyId,
        listOptions,
      );

      for (const translation of translations) {
        if (!translation.localeName || !input.localeNames.has(translation.localeName)) {
          continue;
        }

        const byLocale = translationsByKeyId.get(keyId) ?? new Map<string, PhraseTranslation>();
        byLocale.set(translation.localeName, translation);
        translationsByKeyId.set(keyId, byLocale);
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

function filterKeysByFileTags(keys: PhraseKey[], tags: string[]) {
  if (tags.length === 0) {
    return keys;
  }

  return keys.filter((key) => key.tags.some((tag) => tags.includes(tag)));
}

const PHRASE_QUEUE_SCAN_PAGE_SIZE = 100;
const PHRASE_MAX_SCAN_PAGES = 50;

async function loadPhraseQueuePage(input: {
  client: ReturnType<typeof createPhraseStringsApiClient>;
  scope: PhraseLiveCatContext;
  file: TmsProviderLiveFile;
  sourceLocale: PhraseLocale | null;
  targetLocale: PhraseLocale;
  targetLocaleCode: string;
  paginationInput: ProjectFileCatPaginationInput;
}): Promise<{ segments: PhraseCatSegmentDraft[]; hasMore: boolean }> {
  const metadata = readFileMetadata(input.file);
  const resourceType = input.file.provider?.resourceType;
  const parsedResource = parsePhraseExternalResourceId(
    input.file.provider?.externalResourceId ?? "",
  );
  const listOptions = input.scope.branch ? { branch: input.scope.branch } : {};
  const localeNames = new Set(
    [input.sourceLocale, input.targetLocale]
      .filter((locale): locale is PhraseLocale => locale != null)
      .map((locale) => locale.name),
  );
  const { offset, limit, search, queueFilter } = input.paginationInput;

  if (resourceType === "key") {
    const key =
      (await input.client.getKey(
        input.scope.stringsProjectId,
        parsedResource.resourceId,
        listOptions,
      )) ?? null;
    const keys = key ? [key] : [];
    const translationsByKeyId = await loadTranslationsByKeyId({
      client: input.client,
      projectId: input.scope.stringsProjectId,
      localeNames,
      branch: input.scope.branch,
      keyIds: keys.map((entry) => entry.id),
    });
    const segments = buildSegmentDrafts({
      keys,
      sourceLocale: input.sourceLocale,
      targetLocale: input.targetLocale,
      targetLocaleCode: input.targetLocaleCode,
      translationsByKeyId,
      commentsByKeyId: new Map(),
    })
      .filter(
        (segment) =>
          segmentMatchesQueueFilter(segment, queueFilter) && segmentMatchesSearch(segment, search),
      )
      .slice(offset, offset + limit)
      .map((segment) => ({ ...segment, comments: [] }));

    return {
      segments,
      hasMore: false,
    };
  }

  const needsClientSideFilter =
    queueFilter !== "all" || Boolean(search?.trim()) || metadata.tags.length > 0;

  if (!needsClientSideFilter) {
    const phrasePage = Math.floor(offset / limit) + 1;
    const { keys, hasMore } = await input.client.listKeysPage(input.scope.stringsProjectId, {
      ...listOptions,
      page: phrasePage,
      perPage: limit,
    });
    const translationsByKeyId = await loadTranslationsByKeyId({
      client: input.client,
      projectId: input.scope.stringsProjectId,
      localeNames,
      branch: input.scope.branch,
      keyIds: keys.map((entry) => entry.id),
    });

    return {
      segments: buildSegmentDrafts({
        keys,
        sourceLocale: input.sourceLocale,
        targetLocale: input.targetLocale,
        targetLocaleCode: input.targetLocaleCode,
        translationsByKeyId,
        commentsByKeyId: new Map(),
      }).map((segment) => ({ ...segment, comments: [] })),
      hasMore,
    };
  }

  const collected: PhraseCatSegmentDraft[] = [];
  let skipped = 0;
  let phrasePage = 1;
  let scanComplete = false;

  while (collected.length < limit && phrasePage <= PHRASE_MAX_SCAN_PAGES) {
    const { keys: rawKeys, hasMore } = await input.client.listKeysPage(
      input.scope.stringsProjectId,
      {
        ...listOptions,
        page: phrasePage,
        perPage: PHRASE_QUEUE_SCAN_PAGE_SIZE,
      },
    );
    const keys = filterKeysByFileTags(rawKeys, metadata.tags);

    if (keys.length > 0) {
      const translationsByKeyId = await loadTranslationsByKeyId({
        client: input.client,
        projectId: input.scope.stringsProjectId,
        localeNames,
        branch: input.scope.branch,
        keyIds: keys.map((entry) => entry.id),
      });
      const drafts = buildSegmentDrafts({
        keys,
        sourceLocale: input.sourceLocale,
        targetLocale: input.targetLocale,
        targetLocaleCode: input.targetLocaleCode,
        translationsByKeyId,
        commentsByKeyId: new Map(),
      });

      for (const draft of drafts) {
        if (!segmentMatchesQueueFilter(draft, queueFilter)) {
          continue;
        }
        if (!segmentMatchesSearch(draft, search)) {
          continue;
        }
        if (skipped < offset) {
          skipped += 1;
          continue;
        }

        collected.push({ ...draft, comments: [] });
        if (collected.length >= limit) {
          break;
        }
      }
    }

    if (!hasMore) {
      scanComplete = true;
      break;
    }

    if (collected.length >= limit) {
      break;
    }

    phrasePage += 1;
  }

  return {
    segments: collected,
    hasMore: collected.length >= limit && !scanComplete,
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
  const targetLocale = resolvePhraseTargetLocale(input.targetLocale, locales);

  const paginationInput = input.pagination ?? {
    offset: 0,
    limit: legacyProviderCatSegmentLimit,
    search: undefined,
    queueFilter: "all",
    paginated: true,
  };

  const { segments, hasMore } = await loadPhraseQueuePage({
    client,
    scope,
    file: input.file,
    sourceLocale,
    targetLocale,
    targetLocaleCode: input.targetLocale,
    paginationInput,
  });

  const pagination = buildCatFilePagination({
    offset: paginationInput.offset,
    limit: paginationInput.limit,
    returnedCount: segments.length,
    totalCount: hasMore
      ? paginationInput.offset + segments.length + 1
      : paginationInput.offset + segments.length,
    hasMore,
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

export async function getPhraseLiveCatSegmentDetail(input: {
  secretMaterial: string;
  region?: string | null;
  baseUrl?: string | null;
  externalProjectId: string;
  file: TmsProviderLiveFile;
  targetLocale: string;
  externalStringId: string;
}): Promise<ProjectFileCatSegment | null> {
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
  const targetLocale = resolvePhraseTargetLocale(input.targetLocale, locales);
  const localeNames = new Set(
    [sourceLocale, targetLocale]
      .filter((locale): locale is PhraseLocale => locale != null)
      .map((locale) => locale.name),
  );

  let key: PhraseKey | null;
  try {
    key = await client.getKey(scope.stringsProjectId, input.externalStringId, listOptions);
  } catch (error) {
    if (error instanceof PhraseApiError && error.status === 404) {
      return null;
    }
    mapPhraseApiError(error);
  }

  if (!key) {
    return null;
  }

  const translationsByKeyId = await loadTranslationsByKeyId({
    client,
    projectId: scope.stringsProjectId,
    localeNames,
    branch: scope.branch,
    keyIds: [key.id],
  });

  const translationsByLocale = translationsByKeyId.get(key.id);
  const sourceTranslation = sourceLocale ? translationsByLocale?.get(sourceLocale.name) : null;
  const segment = buildSegmentDrafts({
    keys: [key],
    sourceLocale,
    targetLocale,
    targetLocaleCode: input.targetLocale,
    translationsByKeyId,
    commentsByKeyId: new Map(),
  })[0];

  if (!segment) {
    return null;
  }

  return {
    ...segment,
    sourceText: sourceTranslation?.content?.trim() || segment.sourceText,
    comments: [],
  };
}

export async function getPhraseLiveCatSegmentComments(input: {
  secretMaterial: string;
  region?: string | null;
  baseUrl?: string | null;
  externalProjectId: string;
  file: TmsProviderLiveFile;
  targetLocale: string;
  externalStringId: string;
}): Promise<ProjectFileCatComment[]> {
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

  let key: PhraseKey | null;
  try {
    key = await client.getKey(scope.stringsProjectId, input.externalStringId, listOptions);
  } catch (error) {
    if (error instanceof PhraseApiError && error.status === 404) {
      return [];
    }
    mapPhraseApiError(error);
  }

  if (!key) {
    return [];
  }

  try {
    const remoteComments = await client.listKeyComments(
      scope.stringsProjectId,
      key.id,
      listOptions,
    );
    return remoteComments.map((comment) => mapPhraseKeyComment(comment, input.targetLocale));
  } catch (error) {
    if (error instanceof PhraseApiError && error.status === 404) {
      return [];
    }
    mapPhraseApiError(error);
  }
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

  const targetLocale = resolvePhraseTargetLocale(input.targetLocale, locales);

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

  let locales: PhraseLocale[];
  try {
    locales = await client.listLocales(scope.stringsProjectId, listOptions);
  } catch (error) {
    mapPhraseApiError(error);
  }

  const resolvedLocale = resolvePhraseTargetLocale(input.targetLocale, locales);

  let created: Awaited<ReturnType<typeof client.createKeyComment>>;
  try {
    created = await client.createKeyComment(
      scope.stringsProjectId,
      input.externalStringId,
      {
        message: input.text,
        localeName: resolvedLocale.name,
      },
      listOptions,
    );
  } catch (error) {
    mapPhraseApiError(error);
  }

  return mapPhraseKeyComment(created, input.targetLocale);
}
