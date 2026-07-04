import type {
  ProjectFileCatComment,
  ProjectFileCatQueueResponse,
  ProjectFileCatResponse,
  ProjectFileCatSegment,
  ProjectFileCatTranslation,
} from "@/api/routes/project/project.schema";

export const catApiTestContext = {
  organizationSlug: "acme",
  projectId: "project_1",
  sourcePath: "locales/en.json",
  targetLocale: "fr",
  repositoryFullName: "acme/web",
} as const;

export function createCatProviderMeta() {
  return {
    kind: "crowdin" as const,
    resourceType: "file" as const,
    externalProjectId: "crowdin-project",
    externalResourceId: "crowdin-file",
    externalUrl: null,
    syncState: "ready" as const,
    sourceLocale: "en-US",
    targetLocales: ["fr"],
    localeReadiness: {},
    revision: null,
    format: "react_intl" as const,
    lastSyncedAt: null,
  };
}

export function createCatSegment(
  overrides: Partial<ProjectFileCatSegment> = {},
): ProjectFileCatSegment {
  return {
    externalStringId: "segment-1",
    key: "auth.signIn.title",
    sourceText: "Sign in to your workspace",
    context: "Heading on the sign-in screen",
    type: "text",
    target: {
      text: "Connectez-vous à votre espace",
      externalTranslationId: "translation-1",
      isApproved: false,
    },
    comments: [],
    ...overrides,
  };
}

export function createCatFileResponse(
  overrides: Partial<ProjectFileCatResponse["catFile"]> = {},
): ProjectFileCatResponse {
  return {
    catFile: {
      sourcePath: catApiTestContext.sourcePath,
      filename: "en.json",
      provider: createCatProviderMeta(),
      targetLocale: catApiTestContext.targetLocale,
      canEditTranslations: true,
      truncated: false,
      segments: [createCatSegment()],
      ...overrides,
    },
  };
}

export function createCatQueueResponse(
  overrides: Partial<ProjectFileCatQueueResponse["catQueue"]> = {},
): ProjectFileCatQueueResponse {
  return {
    catQueue: {
      sourcePath: catApiTestContext.sourcePath,
      filename: "en.json",
      provider: createCatProviderMeta(),
      targetLocale: catApiTestContext.targetLocale,
      canEditTranslations: true,
      truncated: false,
      pagination: {
        offset: 0,
        limit: 50,
        returnedCount: 1,
        totalCount: 1,
        hasMore: false,
      },
      segments: [createCatSegment()],
      ...overrides,
    },
  };
}

export function createCatTranslation(
  overrides: Partial<ProjectFileCatTranslation> = {},
): ProjectFileCatTranslation {
  return {
    text: "Connectez-vous à votre espace",
    externalTranslationId: "translation-1",
    isApproved: false,
    ...overrides,
  };
}

export function createCatComment(
  overrides: Partial<ProjectFileCatComment> = {},
): ProjectFileCatComment {
  return {
    externalCommentId: "comment-1",
    type: "comment",
    status: null,
    text: "Please clarify tone.",
    createdAt: "2026-06-10T00:00:00.000Z",
    locale: "fr",
    author: "Reviewer",
    ...overrides,
  };
}

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function errorResponse(error: string, message: string, status: number) {
  return jsonResponse({ error, message }, status);
}
