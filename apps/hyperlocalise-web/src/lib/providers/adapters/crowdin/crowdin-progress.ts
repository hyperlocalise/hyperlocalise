import {
  CrowdinApiClient,
  CrowdinApiError,
  type CrowdinFile,
  type CrowdinSourceString,
} from "@/lib/providers/adapters/crowdin/crowdin-api";
import { escapeCrowdinCroqlString } from "@/lib/providers/adapters/crowdin/crowdin-croql";
import { loadCrowdinProjectCredential } from "@/lib/providers/adapters/crowdin/load-crowdin-project-credential";
import { countCrowdinFileQueueSummary } from "@/lib/projects/cat/project-file-cat-queue-summary";
import { resolveExternalTmsSecretMaterialForActor } from "@/lib/providers/tms-provider-content";
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";

export type CrowdinProgressScope = "project" | "file" | "string";

export type CheckCrowdinProgressInput = {
  organizationId: string;
  projectId: string;
  actorUserId?: string | null;
  scope: CrowdinProgressScope;
  languageIds?: string[];
  filePath?: string;
  fileId?: number;
  stringIdentifier?: string;
  stringId?: number;
  targetLocale?: string;
};

export type CrowdinProgressLanguageSummary = {
  languageId: string;
  translationProgress: number;
  approvalProgress: number;
  words: CrowdinLanguageProgressWords;
  phrases: CrowdinLanguageProgressWords;
};

type CrowdinLanguageProgressWords = {
  total: number;
  translated: number;
  approved: number;
};

export type CheckCrowdinProgressResult = {
  scope: CrowdinProgressScope;
  crowdinProjectId: number;
  crowdinProjectName: string;
  resource?: {
    type: "file" | "string";
    id: number;
    path?: string;
    identifier?: string;
    text?: string;
  };
  languages: CrowdinProgressLanguageSummary[];
  queueSummary?: {
    targetLocale: string;
    total: number;
    reviewed: number;
    untranslated: number;
    needsReview: number;
    hasIssues: number;
  };
  stringTranslations?: Array<{
    languageId: string;
    translated: boolean;
    approved: boolean;
    text: string | null;
  }>;
};

type CrowdinProgressError =
  | { code: "crowdin_not_configured"; message: string }
  | { code: "crowdin_resource_not_found"; message: string }
  | { code: "crowdin_invalid_input"; message: string }
  | { code: "crowdin_api_error"; message: string };

function toLanguageSummary(
  progress: Awaited<ReturnType<CrowdinApiClient["listProjectLanguageProgress"]>>[number],
): CrowdinProgressLanguageSummary {
  return {
    languageId: progress.languageId,
    translationProgress: progress.translationProgress,
    approvalProgress: progress.approvalProgress,
    words: progress.words,
    phrases: progress.phrases,
  };
}

function normalizePath(value: string) {
  return value.trim().replace(/^\/+/, "").toLowerCase();
}

const CROWDIN_USER_CONNECTION_ERROR_MESSAGES: Record<string, string> = {
  crowdin_user_connection_required:
    "Connect your Crowdin account before checking Crowdin progress.",
  crowdin_user_connection_auth_mode_mismatch:
    "Reconnect your Crowdin account after the workspace authentication mode changed.",
};

async function createCrowdinClient(input: {
  organizationId: string;
  projectId: string;
  actorUserId?: string | null;
}): Promise<
  Result<
    { client: CrowdinApiClient; crowdinProjectId: number },
    Extract<CrowdinProgressError, { code: "crowdin_not_configured" | "crowdin_api_error" }>
  >
> {
  const projectCredential = await loadCrowdinProjectCredential(input);
  if (!projectCredential) {
    return err({
      code: "crowdin_not_configured" as const,
      message:
        "This project is not linked to Crowdin. Connect a Crowdin TMS project before checking progress.",
    });
  }

  const crowdinProjectId = Number.parseInt(projectCredential.externalProjectId, 10);
  if (!Number.isFinite(crowdinProjectId)) {
    return err({
      code: "crowdin_not_configured" as const,
      message: "The linked Crowdin project ID is invalid.",
    });
  }

  let token: string;
  try {
    token = await resolveExternalTmsSecretMaterialForActor({
      credential: projectCredential.credential,
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
    });
  } catch (error) {
    if (error instanceof Error) {
      const message = CROWDIN_USER_CONNECTION_ERROR_MESSAGES[error.message];
      if (message) {
        return err({
          code: "crowdin_api_error" as const,
          message,
        });
      }
    }

    throw error;
  }

  const client = new CrowdinApiClient({
    token,
    baseUrl: projectCredential.credential.baseUrl ?? undefined,
  });
  return ok({ client, crowdinProjectId });
}

async function resolveCrowdinFile(
  client: CrowdinApiClient,
  crowdinProjectId: number,
  input: Pick<CheckCrowdinProgressInput, "fileId" | "filePath">,
): Promise<
  Result<
    CrowdinFile,
    Extract<CrowdinProgressError, { code: "crowdin_resource_not_found" | "crowdin_invalid_input" }>
  >
> {
  if (input.fileId != null) {
    const files = await client.listFiles(crowdinProjectId);
    const match = files.find((file) => file.id === input.fileId);
    if (!match) {
      return err({
        code: "crowdin_resource_not_found" as const,
        message: `Crowdin file ${input.fileId} was not found in this project.`,
      });
    }

    return ok(match);
  }

  const filePath = input.filePath?.trim();
  if (!filePath) {
    return err({
      code: "crowdin_invalid_input" as const,
      message: "Provide fileId or filePath when checking file progress.",
    });
  }

  const normalizedTarget = normalizePath(filePath);
  const files = await client.listFiles(crowdinProjectId);
  const exact = files.find((file) => normalizePath(file.path) === normalizedTarget);
  if (exact) {
    return ok(exact);
  }

  const basename = normalizedTarget.split("/").at(-1);
  const basenameMatches = files.filter((file) => normalizePath(file.name) === basename);
  if (basenameMatches.length === 1) {
    return ok(basenameMatches[0]!);
  }

  const partialMatches = files.filter(
    (file) =>
      normalizePath(file.path).includes(normalizedTarget) ||
      normalizePath(file.name).includes(normalizedTarget),
  );
  if (partialMatches.length === 1) {
    return ok(partialMatches[0]!);
  }

  if (partialMatches.length > 1) {
    const paths = partialMatches.slice(0, 5).map((file) => file.path);
    return err({
      code: "crowdin_resource_not_found" as const,
      message: `Multiple Crowdin files matched "${filePath}". Specify fileId or a more precise path. Matches: ${paths.join(", ")}`,
    });
  }

  return err({
    code: "crowdin_resource_not_found" as const,
    message: `No Crowdin file matched "${filePath}".`,
  });
}

async function resolveCrowdinString(
  client: CrowdinApiClient,
  crowdinProjectId: number,
  input: Pick<CheckCrowdinProgressInput, "stringId" | "stringIdentifier">,
): Promise<
  Result<
    CrowdinSourceString,
    Extract<CrowdinProgressError, { code: "crowdin_resource_not_found" | "crowdin_invalid_input" }>
  >
> {
  if (input.stringId != null) {
    const strings = await client.listSourceStrings(crowdinProjectId, {
      croql: `id = ${input.stringId}`,
      maxItems: 1,
    });
    const match = strings[0];
    if (!match) {
      return err({
        code: "crowdin_resource_not_found" as const,
        message: `Crowdin string ${input.stringId} was not found in this project.`,
      });
    }

    return ok(match);
  }

  const identifier = input.stringIdentifier?.trim();
  if (!identifier) {
    return err({
      code: "crowdin_invalid_input" as const,
      message: "Provide stringId or stringIdentifier when checking string progress.",
    });
  }

  const escaped = escapeCrowdinCroqlString(identifier);
  const exactStrings = await client.listSourceStrings(crowdinProjectId, {
    croql: `identifier = "${escaped}"`,
    maxItems: 5,
  });
  if (exactStrings.length === 1) {
    return ok(exactStrings[0]!);
  }

  if (exactStrings.length > 1) {
    const ids = exactStrings.map((entry) => entry.id).join(", ");
    return err({
      code: "crowdin_resource_not_found" as const,
      message: `Multiple Crowdin strings matched identifier "${identifier}". Refine with stringId. Matches: ${ids}`,
    });
  }

  const partialStrings = await client.listSourceStrings(crowdinProjectId, {
    croql: `identifier contains "${escaped}"`,
    maxItems: 5,
  });
  if (partialStrings.length === 1) {
    return ok(partialStrings[0]!);
  }

  if (partialStrings.length > 1) {
    const ids = partialStrings.map((entry) => entry.id).join(", ");
    return err({
      code: "crowdin_resource_not_found" as const,
      message: `Multiple Crowdin strings partially matched "${identifier}". Refine with stringId. Matches: ${ids}`,
    });
  }

  return err({
    code: "crowdin_resource_not_found" as const,
    message: `No Crowdin string matched identifier "${identifier}".`,
  });
}

function formatStringText(text: string | Record<string, string>) {
  if (typeof text === "string") {
    return text;
  }

  const values = Object.values(text);
  return values[0] ?? JSON.stringify(text);
}

async function loadStringTranslationStatus(
  client: CrowdinApiClient,
  crowdinProjectId: number,
  stringId: number,
  languageIds: string[],
) {
  const stringTranslations: CheckCrowdinProgressResult["stringTranslations"] = [];

  for (const languageId of languageIds) {
    const translations = await client.listStringTranslations(
      crowdinProjectId,
      stringId,
      languageId,
    );
    const latest = translations.at(-1) ?? null;
    const approvals = latest
      ? await client.listTranslationApprovals(crowdinProjectId, languageId, {
          stringId,
        })
      : [];

    stringTranslations.push({
      languageId,
      translated: Boolean(latest?.text?.trim()),
      approved: approvals.some((approval) => approval.translationId === latest?.id),
      text: latest?.text ?? null,
    });
  }

  return stringTranslations;
}

export async function checkCrowdinProgress(
  input: CheckCrowdinProgressInput,
): Promise<Result<CheckCrowdinProgressResult, CrowdinProgressError>> {
  const clientResult = await createCrowdinClient({
    organizationId: input.organizationId,
    projectId: input.projectId,
    actorUserId: input.actorUserId,
  });
  if (isErr(clientResult)) {
    return clientResult;
  }

  const { client, crowdinProjectId } = clientResult.value;

  try {
    const crowdinProject = await client.getProject(crowdinProjectId);
    const languageFilter = input.languageIds?.length ? input.languageIds : undefined;

    if (input.scope === "project") {
      const languages = await client.listProjectLanguageProgress(crowdinProjectId, {
        languageIds: languageFilter,
      });

      return ok({
        scope: "project",
        crowdinProjectId,
        crowdinProjectName: crowdinProject.name,
        languages: languages.map(toLanguageSummary),
      });
    }

    if (input.scope === "file") {
      const fileResult = await resolveCrowdinFile(client, crowdinProjectId, input);
      if (isErr(fileResult)) {
        return fileResult;
      }

      const file = fileResult.value;
      const languages = await client.listFileLanguageProgress(crowdinProjectId, file.id, {
        languageIds: languageFilter,
      });

      const result: CheckCrowdinProgressResult = {
        scope: "file",
        crowdinProjectId,
        crowdinProjectName: crowdinProject.name,
        resource: {
          type: "file",
          id: file.id,
          path: file.path,
        },
        languages: languages.map(toLanguageSummary),
      };

      const targetLocale = input.targetLocale?.trim();
      if (targetLocale) {
        const queueSummary = await countCrowdinFileQueueSummary(
          client,
          crowdinProjectId,
          file.id,
          targetLocale,
        );
        result.queueSummary = {
          targetLocale,
          ...queueSummary,
        };
      }

      return ok(result);
    }

    const stringResult = await resolveCrowdinString(client, crowdinProjectId, input);
    if (isErr(stringResult)) {
      return stringResult;
    }

    const sourceString = stringResult.value;
    const languageIds =
      languageFilter ??
      crowdinProject.targetLanguageIds.filter(
        (languageId) => languageId !== crowdinProject.sourceLanguageId,
      );

    const stringTranslations = await loadStringTranslationStatus(
      client,
      crowdinProjectId,
      sourceString.id,
      languageIds,
    );

    return ok({
      scope: "string",
      crowdinProjectId,
      crowdinProjectName: crowdinProject.name,
      resource: {
        type: "string",
        id: sourceString.id,
        identifier: sourceString.identifier,
        text: formatStringText(sourceString.text),
      },
      languages: stringTranslations.map((entry) => ({
        languageId: entry.languageId,
        translationProgress: entry.translated ? 100 : 0,
        approvalProgress: entry.approved ? 100 : 0,
        words: {
          total: 1,
          translated: entry.translated ? 1 : 0,
          approved: entry.approved ? 1 : 0,
        },
        phrases: {
          total: 1,
          translated: entry.translated ? 1 : 0,
          approved: entry.approved ? 1 : 0,
        },
      })),
      stringTranslations,
    });
  } catch (error) {
    if (error instanceof CrowdinApiError && error.status === 401) {
      return err({
        code: "crowdin_api_error",
        message: "Your Crowdin connection is invalid. Reconnect Crowdin and try again.",
      });
    }

    return err({
      code: "crowdin_api_error",
      message: error instanceof Error ? error.message : "Crowdin API request failed.",
    });
  }
}
