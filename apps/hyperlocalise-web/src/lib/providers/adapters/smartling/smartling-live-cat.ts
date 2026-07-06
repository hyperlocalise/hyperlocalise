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
  SmartlingApiClient,
  SmartlingApiError,
  type SmartlingIssue,
  type SmartlingLocaleTranslation,
  type SmartlingSourceString,
} from "./smartling-api";
import { parseSmartlingCredentials } from "./smartling-credentials";
import { mapProviderSeverityToSmartling } from "./smartling-comment-write-back";

export class SmartlingLiveCatError extends Error {
  constructor(
    readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "SmartlingLiveCatError";
  }
}

type SmartlingLiveCatContext = {
  client: SmartlingApiClient;
  projectId: string;
};

type SmartlingResourceScope = {
  fileUri: string | null;
  hashcode: string | null;
};

type SmartlingQueueSegmentDraft = {
  externalStringId: string;
  key: string;
  sourceText: string;
  context: string | null;
  type: string | null;
};

function mapSmartlingApiError(error: unknown): never {
  if (error instanceof SmartlingApiError && error.status === 401) {
    throw new SmartlingLiveCatError("smartling_auth_invalid", "Smartling credentials are invalid.");
  }
  throw error;
}

function resolveSmartlingLiveCatContext(input: {
  secretMaterial: string;
  externalProjectId: string;
  authBaseUrl?: string | null;
}): SmartlingLiveCatContext {
  const projectId = input.externalProjectId.trim();
  if (!projectId) {
    throw new SmartlingLiveCatError(
      "invalid_smartling_project_id",
      "Smartling project identifier is invalid.",
    );
  }

  const credentials = parseSmartlingCredentials(input.secretMaterial);
  const client = new SmartlingApiClient({
    credentials,
    authBaseUrl: input.authBaseUrl ?? undefined,
  });

  return { client, projectId };
}

function resolveSmartlingResourceScope(file: TmsProviderLiveFile): SmartlingResourceScope {
  const resourceType = file.provider?.resourceType ?? "file";
  const externalResourceId = file.provider?.externalResourceId?.trim() ?? "";

  if (resourceType === "key") {
    const separatorIndex = externalResourceId.indexOf("::");
    if (separatorIndex > 0) {
      return {
        fileUri: externalResourceId.slice(0, separatorIndex),
        hashcode: externalResourceId.slice(separatorIndex + 2) || null,
      };
    }

    const sourcePath = file.sourcePath.trim();
    const keyPrefix = "/keys/";
    const keyIndex = sourcePath.lastIndexOf(keyPrefix);
    if (keyIndex > 0) {
      return {
        fileUri: sourcePath.slice(0, keyIndex),
        hashcode: sourcePath.slice(keyIndex + keyPrefix.length) || externalResourceId || null,
      };
    }

    return { fileUri: null, hashcode: externalResourceId || null };
  }

  return {
    fileUri: externalResourceId || file.sourcePath.trim() || null,
    hashcode: null,
  };
}

function buildQueueSegmentFromSourceString(
  sourceString: SmartlingSourceString,
): SmartlingQueueSegmentDraft {
  const instruction =
    typeof sourceString.metadata?.instruction === "string"
      ? sourceString.metadata.instruction
      : null;

  return {
    externalStringId: sourceString.hashcode,
    key: sourceString.variant?.trim() || sourceString.hashcode,
    sourceText: sourceString.stringText?.trim() || sourceString.hashcode,
    context: instruction,
    type: sourceString.variant ?? null,
  };
}

function draftToQueueSegment(draft: SmartlingQueueSegmentDraft): ProjectFileCatQueueSegment {
  return {
    externalStringId: draft.externalStringId,
    key: draft.key,
    sourceText: draft.sourceText,
    context: draft.context,
    type: draft.type,
  };
}

function segmentMatchesSearch(segment: SmartlingQueueSegmentDraft, search: string | undefined) {
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

function translationIsApproved(translation: SmartlingLocaleTranslation) {
  if (!translation.translation?.trim()) {
    return false;
  }
  if (translation.authorized === true || translation.published === true) {
    return true;
  }
  const publishStatus = translation.publishStatus?.toLowerCase() ?? "";
  return ["published", "authorized", "approved", "completed", "complete"].includes(publishStatus);
}

function mapSmartlingTargetTranslation(
  translation: SmartlingLocaleTranslation | null | undefined,
): ProjectFileCatTranslation | null {
  if (!translation?.translation?.trim()) {
    return null;
  }

  return {
    text: translation.translation,
    externalTranslationId: translation.hashcode ?? null,
    isApproved: translationIsApproved(translation),
  };
}

function mapSmartlingIssueToComment(issue: SmartlingIssue): ProjectFileCatComment {
  const state = issue.issueStateCode?.trim().toUpperCase() ?? "";
  return {
    externalCommentId: issue.issueUid,
    type: "issue",
    status: state === "RESOLVED" || state === "CLOSED" ? "resolved" : "unresolved",
    text: issue.issueText ?? "",
    createdAt: null,
    locale: issue.string?.localeId ?? null,
    author: null,
  };
}

async function loadOpenIssueHashcodes(input: {
  client: SmartlingApiClient;
  projectId: string;
  hashcodes: string[];
}) {
  if (input.hashcodes.length === 0) {
    return new Set<string>();
  }

  const issues = await input.client.listIssues(input.projectId, {
    stringFilter: { hashcodes: input.hashcodes },
    issueStateCodes: ["OPENED"],
  });

  return new Set(
    issues
      .map((issue) => issue.string?.hashcode?.trim())
      .filter((hashcode): hashcode is string => Boolean(hashcode)),
  );
}

async function loadSmartlingQueueSegments(input: {
  scope: SmartlingLiveCatContext;
  file: TmsProviderLiveFile;
  resourceScope: SmartlingResourceScope;
  paginationInput: ProjectFileCatPaginationInput;
}): Promise<{
  segments: ProjectFileCatQueueSegment[];
  hasMore: boolean;
}> {
  const { queueFilter, search, offset, limit } = input.paginationInput;

  if (input.resourceScope.hashcode) {
    const strings = await input.scope.client.listSourceStrings(input.scope.projectId, {
      fileUri: input.resourceScope.fileUri ?? undefined,
    });
    const sourceString =
      strings.find((item) => item.hashcode === input.resourceScope.hashcode) ??
      ({
        hashcode: input.resourceScope.hashcode,
        stringText: input.file.filename,
        fileUri: input.resourceScope.fileUri,
      } satisfies SmartlingSourceString);

    const draft = buildQueueSegmentFromSourceString(sourceString);
    if (!segmentMatchesSearch(draft, search)) {
      return { segments: [], hasMore: false };
    }
    if (queueFilter === "has_issues") {
      const openIssues = await loadOpenIssueHashcodes({
        client: input.scope.client,
        projectId: input.scope.projectId,
        hashcodes: [draft.externalStringId],
      });
      if (!openIssues.has(draft.externalStringId)) {
        return { segments: [], hasMore: false };
      }
    }

    return { segments: [draftToQueueSegment(draft)], hasMore: false };
  }

  if (!input.paginationInput.paginated) {
    const page = await input.scope.client.listSourceStringsPage(input.scope.projectId, {
      fileUri: input.resourceScope.fileUri ?? undefined,
      offset: 0,
      limit: legacyProviderCatSegmentLimit + 1,
    });

    let drafts = page.strings
      .map(buildQueueSegmentFromSourceString)
      .filter((draft) => segmentMatchesSearch(draft, search));

    if (queueFilter === "has_issues") {
      const openIssues = await loadOpenIssueHashcodes({
        client: input.scope.client,
        projectId: input.scope.projectId,
        hashcodes: drafts.map((draft) => draft.externalStringId),
      });
      drafts = drafts.filter((draft) => openIssues.has(draft.externalStringId));
    }

    const truncated = drafts.length > legacyProviderCatSegmentLimit || page.hasMore;
    const visible = truncated ? drafts.slice(0, legacyProviderCatSegmentLimit) : drafts;
    return { segments: visible.map(draftToQueueSegment), hasMore: truncated };
  }

  const page = await input.scope.client.listSourceStringsPage(input.scope.projectId, {
    fileUri: input.resourceScope.fileUri ?? undefined,
    offset,
    limit,
  });

  let drafts = page.strings
    .map(buildQueueSegmentFromSourceString)
    .filter((draft) => segmentMatchesSearch(draft, search));

  if (queueFilter === "has_issues") {
    const openIssues = await loadOpenIssueHashcodes({
      client: input.scope.client,
      projectId: input.scope.projectId,
      hashcodes: drafts.map((draft) => draft.externalStringId),
    });
    drafts = drafts.filter((draft) => openIssues.has(draft.externalStringId));
  }

  return {
    segments: drafts.map(draftToQueueSegment),
    hasMore: page.hasMore,
  };
}

export async function buildSmartlingLiveCatFile(input: {
  secretMaterial: string;
  authBaseUrl?: string | null;
  externalProjectId: string;
  file: TmsProviderLiveFile;
  targetLocale: string;
  canEditTranslations: boolean;
  pagination?: ProjectFileCatPaginationInput;
}): Promise<ProjectFileCatQueueFile> {
  const scope = resolveSmartlingLiveCatContext({
    secretMaterial: input.secretMaterial,
    externalProjectId: input.externalProjectId,
    authBaseUrl: input.authBaseUrl,
  });
  const resourceScope = resolveSmartlingResourceScope(input.file);

  const paginationInput = input.pagination ?? {
    offset: 0,
    limit: legacyProviderCatSegmentLimit,
    search: undefined,
    queueFilter: "all",
    paginated: false,
  };

  let loaded;
  try {
    loaded = await loadSmartlingQueueSegments({
      scope,
      file: input.file,
      resourceScope,
      paginationInput,
    });
  } catch (error) {
    mapSmartlingApiError(error);
  }

  const pagination = paginationInput.paginated
    ? buildCatFilePagination({
        offset: paginationInput.offset,
        limit: paginationInput.limit,
        returnedCount: loaded.segments.length,
        totalCount: loaded.hasMore
          ? paginationInput.offset + loaded.segments.length + 1
          : paginationInput.offset + loaded.segments.length,
        hasMore: loaded.hasMore,
      })
    : undefined;

  return {
    sourcePath: input.file.sourcePath,
    filename: input.file.filename,
    provider: input.file.provider,
    targetLocale: input.targetLocale,
    canEditTranslations: input.canEditTranslations,
    truncated: loaded.hasMore,
    pagination,
    segments: loaded.segments,
  };
}

export async function getSmartlingLiveCatSegmentTarget(input: {
  secretMaterial: string;
  authBaseUrl?: string | null;
  externalProjectId: string;
  file: TmsProviderLiveFile;
  targetLocale: string;
  externalStringId: string;
}): Promise<ProjectFileCatTranslation | null | "not_found"> {
  const scope = resolveSmartlingLiveCatContext({
    secretMaterial: input.secretMaterial,
    externalProjectId: input.externalProjectId,
    authBaseUrl: input.authBaseUrl,
  });
  const resourceScope = resolveSmartlingResourceScope(input.file);
  const hashcode = input.externalStringId.trim();
  if (!hashcode) {
    return "not_found";
  }

  let translations: SmartlingLocaleTranslation[];
  try {
    translations = await scope.client.listLocaleTranslations(
      scope.projectId,
      input.targetLocale,
      resourceScope.fileUri ? { fileUri: resourceScope.fileUri } : undefined,
    );
  } catch (error) {
    if (error instanceof SmartlingApiError && error.status === 404) {
      return "not_found";
    }
    mapSmartlingApiError(error);
  }

  const target = translations.find((translation) => translation.hashcode === hashcode) ?? null;
  if (!target) {
    return null;
  }

  return mapSmartlingTargetTranslation(target);
}

export async function getSmartlingLiveCatSegmentComments(input: {
  secretMaterial: string;
  authBaseUrl?: string | null;
  externalProjectId: string;
  file: TmsProviderLiveFile;
  targetLocale: string;
  externalStringId: string;
}): Promise<ProjectFileCatComment[]> {
  const scope = resolveSmartlingLiveCatContext({
    secretMaterial: input.secretMaterial,
    externalProjectId: input.externalProjectId,
    authBaseUrl: input.authBaseUrl,
  });
  const hashcode = input.externalStringId.trim();
  if (!hashcode) {
    return [];
  }

  let issues: SmartlingIssue[];
  try {
    issues = await scope.client.listIssues(scope.projectId, {
      stringFilter: {
        hashcodes: [hashcode],
        localeIds: [input.targetLocale],
      },
    });
  } catch (error) {
    if (error instanceof SmartlingApiError && error.status === 404) {
      return [];
    }
    mapSmartlingApiError(error);
  }

  return issues.map(mapSmartlingIssueToComment);
}

export async function saveSmartlingLiveCatTranslation(input: {
  secretMaterial: string;
  authBaseUrl?: string | null;
  externalProjectId: string;
  file: TmsProviderLiveFile;
  targetLocale: string;
  externalStringId: string;
  text: string;
}): Promise<ProjectFileCatTranslation> {
  const scope = resolveSmartlingLiveCatContext({
    secretMaterial: input.secretMaterial,
    externalProjectId: input.externalProjectId,
    authBaseUrl: input.authBaseUrl,
  });
  const hashcode = input.externalStringId.trim();
  if (!hashcode) {
    throw new SmartlingLiveCatError(
      "invalid_smartling_string_id",
      "Smartling string identifier is invalid.",
    );
  }

  try {
    await scope.client.upsertLocaleTranslations(scope.projectId, input.targetLocale, [
      {
        hashcode,
        translation: input.text,
      },
    ]);
  } catch (error) {
    mapSmartlingApiError(error);
  }

  return {
    text: input.text,
    externalTranslationId: hashcode,
    isApproved: false,
  };
}

export async function saveSmartlingLiveCatComment(input: {
  secretMaterial: string;
  authBaseUrl?: string | null;
  externalProjectId: string;
  file: TmsProviderLiveFile;
  targetLocale: string;
  externalStringId: string;
  text: string;
  type?: "comment" | "issue";
  issueType?: string;
}): Promise<ProjectFileCatComment> {
  const scope = resolveSmartlingLiveCatContext({
    secretMaterial: input.secretMaterial,
    externalProjectId: input.externalProjectId,
    authBaseUrl: input.authBaseUrl,
  });
  const hashcode = input.externalStringId.trim();
  if (!hashcode) {
    throw new SmartlingLiveCatError(
      "invalid_smartling_string_id",
      "Smartling string identifier is invalid.",
    );
  }

  const commentType = input.type ?? "comment";

  let created: SmartlingIssue;
  try {
    created = await scope.client.createIssue(scope.projectId, {
      string: {
        hashcode,
        localeId: input.targetLocale,
      },
      issueTypeCode:
        commentType === "issue" ? input.issueType?.trim().toUpperCase() || "REVIEW" : "REVIEW",
      issueText: input.text,
      issueSeverityLevelCode: mapProviderSeverityToSmartling("warning"),
    });
  } catch (error) {
    mapSmartlingApiError(error);
  }

  return mapSmartlingIssueToComment(created);
}

export async function resolveSmartlingLiveCatComment(input: {
  secretMaterial: string;
  authBaseUrl?: string | null;
  externalProjectId: string;
  externalCommentId: string;
}): Promise<ProjectFileCatComment> {
  const scope = resolveSmartlingLiveCatContext({
    secretMaterial: input.secretMaterial,
    externalProjectId: input.externalProjectId,
    authBaseUrl: input.authBaseUrl,
  });
  const issueUid = input.externalCommentId.trim();
  if (!issueUid) {
    throw new SmartlingLiveCatError(
      "invalid_smartling_comment_id",
      "Smartling issue identifier is invalid.",
    );
  }

  let closed: SmartlingIssue;
  try {
    closed = await scope.client.closeIssue(scope.projectId, issueUid);
  } catch (error) {
    mapSmartlingApiError(error);
  }

  return mapSmartlingIssueToComment(closed);
}
