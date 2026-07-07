import type { CatGlossaryTerm, CatTranslationMemoryMatch } from "@/components/cat/shared/types";
import { inferTmMatchKind } from "@/components/cat/intelligence/tm-match-quality";
import { crowdinTmsProvider } from "@/lib/providers/adapters/crowdin/crowdin-provider";
import { CrowdinApiClient } from "@/lib/providers/adapters/crowdin/crowdin-api";
import {
  crowdinAuth,
  type CrowdinProjectCredential,
} from "@/lib/providers/adapters/crowdin/crowdin-auth";
import { lokaliseTmsProvider } from "@/lib/providers/adapters/lokalise/lokalise-provider";
import { LokaliseApiClient } from "@/lib/providers/adapters/lokalise/lokalise-api";
import { lokaliseAuth } from "@/lib/providers/adapters/lokalise/lokalise-auth";
import { PhraseApiClient } from "@/lib/providers/adapters/phrase/phrase-api";
import { phraseTmsProvider } from "@/lib/providers/adapters/phrase/phrase-provider";
import { SmartlingApiClient } from "@/lib/providers/adapters/smartling/smartling-api";
import { smartlingTmsProvider } from "@/lib/providers/adapters/smartling/smartling-provider";
import { TmsProviderLiveError } from "@/lib/providers/jobs/tms-provider-live-error";
import { tryLoadActiveTmsProviderContext } from "@/lib/providers/jobs/tms-provider-live";
import { resolveExternalTmsSecretMaterialForActor } from "@/lib/providers/shared/tms-provider-content";
import type { ExternalTmsProviderKind } from "@/lib/providers/contracts/external-tms-provider-kind";
import type { NormalizedGlossaryMatch } from "@/lib/providers/contracts/glossary-match";
import type { NormalizedTranslationMemoryMatch } from "@/lib/providers/contracts/translation-memory-match";
import {
  defaultGlossaryMatchResolution,
  defaultTranslationMemoryMatchResolution,
} from "@/lib/providers/capabilities/match-resolution";
import {
  GlossaryConcordanceService,
  TranslationMemoryConcordanceService,
} from "@/lib/translation/concordance";
import { assembleStringTranslationContextSnapshot } from "@/lib/translation/context";
import type {
  CatAiRecommendationError,
  CatAiRecommendationInput,
  CatAiRecommendationResult,
} from "@/lib/translation/domain";
import {
  CatRecommendationEngine,
  loadOrganizationTranslationModel,
} from "@/lib/translation/generation";
import { err, ok, type Result } from "@/lib/primitives/result/results";

export type {
  CatVisualContext,
  CatVisualContextMarker,
  CatVisualContextScreenshot,
} from "@/lib/translation/cat-visual-context";

export { pixelRectToPercentMarkers } from "@/lib/translation/cat-visual-context";

export type CatSegmentConcordance = {
  glossaryTerms: CatGlossaryTerm[];
  translationMemoryMatches: CatTranslationMemoryMatch[];
};

export type CatConcordanceForAiRecommendation = CatSegmentConcordance;

function toCatGlossaryTerm(match: NormalizedGlossaryMatch): CatGlossaryTerm {
  return {
    id: match.id,
    source: match.sourceTerm,
    target: match.targetTerm,
    approved: match.termStatus.preferred,
    forbidden: match.termStatus.forbidden,
  };
}

function toCatTranslationMemoryMatch(
  match: NormalizedTranslationMemoryMatch,
  querySourceText: string,
): CatTranslationMemoryMatch {
  const matchPercent = match.matchScore ?? 0;

  return {
    id: match.id,
    sourceText: match.sourceText,
    targetText: match.targetText,
    matchPercent,
    matchKind: inferTmMatchKind(matchPercent, querySourceText, match.sourceText),
    contextLabel: match.memoryName,
  };
}

type LiveConcordanceBundle = {
  glossaryTerms: NormalizedGlossaryMatch[];
  translationMemoryMatches: NormalizedTranslationMemoryMatch[];
};

interface LiveConcordanceStrategy {
  readonly providerKind: ExternalTmsProviderKind;
  search(input: {
    organizationId: string;
    projectId: string;
    actorUserId?: string | null;
    sourceLocale: string;
    targetLocale: string;
    sourceText: string;
  }): Promise<LiveConcordanceBundle | null>;
}

const CROWDIN_USER_CONNECTION_ERROR_MESSAGES: Record<string, string> = {
  crowdin_user_connection_required:
    "Connect your Crowdin account before loading glossary and translation memory matches.",
  crowdin_user_connection_auth_mode_mismatch:
    "Reconnect your Crowdin account after the workspace authentication mode changed.",
};

const CROWDIN_OAUTH_ERROR_CODES = new Set([
  "crowdin_oauth_refresh_failed",
  "crowdin_oauth_token_invalid",
]);

const CROWDIN_USER_AUTH_INVALID_MESSAGE =
  "Your Crowdin connection is invalid. Reconnect Crowdin and try again.";

const LOKALISE_USER_CONNECTION_ERROR_MESSAGES: Record<string, string> = {
  lokalise_user_connection_required:
    "Connect your Lokalise account before loading glossary and translation memory matches.",
};

const LOKALISE_OAUTH_ERROR_CODES = new Set([
  "lokalise_oauth_refresh_failed",
  "lokalise_oauth_token_invalid",
  "lokalise_oauth_token_response_invalid",
]);

const LOKALISE_USER_AUTH_INVALID_MESSAGE =
  "Your Lokalise connection is invalid. Reconnect Lokalise and try again.";

async function resolveConcordanceToken(input: {
  organizationId: string;
  credential: CrowdinProjectCredential["credential"];
  actorUserId?: string | null;
  userConnectionMessages: Record<string, string>;
  oauthErrorCodes: Set<string>;
  invalidAuthCode: string;
  invalidAuthMessage: string;
}): Promise<string> {
  try {
    return await resolveExternalTmsSecretMaterialForActor({
      credential: input.credential,
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
    });
  } catch (error) {
    if (error instanceof Error) {
      const message = input.userConnectionMessages[error.message];
      if (message) {
        throw new TmsProviderLiveError(error.message, message);
      }

      if (input.oauthErrorCodes.has(error.message)) {
        throw new TmsProviderLiveError(input.invalidAuthCode, input.invalidAuthMessage);
      }
    }

    throw error;
  }
}

class CrowdinLiveConcordanceStrategy implements LiveConcordanceStrategy {
  readonly providerKind = "crowdin" as const;

  async search(input: {
    organizationId: string;
    projectId: string;
    actorUserId?: string | null;
    sourceLocale: string;
    targetLocale: string;
    sourceText: string;
  }) {
    const projectCredential = await crowdinAuth.loadProjectCredential({
      organizationId: input.organizationId,
      projectId: input.projectId,
    });
    if (!projectCredential) {
      return null;
    }

    const { credential, externalProjectId } = projectCredential;
    const token = await resolveConcordanceToken({
      organizationId: input.organizationId,
      credential,
      actorUserId: input.actorUserId,
      userConnectionMessages: CROWDIN_USER_CONNECTION_ERROR_MESSAGES,
      oauthErrorCodes: CROWDIN_OAUTH_ERROR_CODES,
      invalidAuthCode: "crowdin_user_auth_invalid",
      invalidAuthMessage: CROWDIN_USER_AUTH_INVALID_MESSAGE,
    });

    const client = new CrowdinApiClient({
      token,
      baseUrl: credential.baseUrl ?? undefined,
    });

    return crowdinTmsProvider.searchCatConcordance({
      client,
      externalProjectId,
      sourceLocale: input.sourceLocale,
      targetLocale: input.targetLocale,
      sourceText: input.sourceText,
    });
  }
}

class LokaliseLiveConcordanceStrategy implements LiveConcordanceStrategy {
  readonly providerKind = "lokalise" as const;

  async search(input: {
    organizationId: string;
    projectId: string;
    actorUserId?: string | null;
    sourceLocale: string;
    targetLocale: string;
    sourceText: string;
  }) {
    const projectCredential = await lokaliseAuth.loadProjectCredential({
      organizationId: input.organizationId,
      projectId: input.projectId,
    });
    if (!projectCredential) {
      return null;
    }

    const { credential, externalProjectId } = projectCredential;
    const token = await resolveConcordanceToken({
      organizationId: input.organizationId,
      credential,
      actorUserId: input.actorUserId,
      userConnectionMessages: LOKALISE_USER_CONNECTION_ERROR_MESSAGES,
      oauthErrorCodes: LOKALISE_OAUTH_ERROR_CODES,
      invalidAuthCode: "lokalise_user_auth_invalid",
      invalidAuthMessage: LOKALISE_USER_AUTH_INVALID_MESSAGE,
    });

    const client = new LokaliseApiClient({
      token,
      baseUrl: credential.baseUrl,
    });

    return lokaliseTmsProvider.searchCatConcordance({
      client,
      externalProjectId,
      sourceLocale: input.sourceLocale,
      targetLocale: input.targetLocale,
      sourceText: input.sourceText,
    });
  }
}

export class CatConcordanceService {
  private readonly glossaryService = new GlossaryConcordanceService();
  private readonly memoryService = new TranslationMemoryConcordanceService();
  private readonly liveStrategies = new Map<ExternalTmsProviderKind, LiveConcordanceStrategy>([
    ["crowdin", new CrowdinLiveConcordanceStrategy()],
    ["lokalise", new LokaliseLiveConcordanceStrategy()],
  ]);

  async loadSegmentConcordance(input: {
    organizationId: string;
    projectId: string;
    providerKind?: ExternalTmsProviderKind | null;
    actorUserId?: string | null;
    sourceLocale: string;
    targetLocale: string;
    sourceText: string;
  }): Promise<CatSegmentConcordance> {
    if (input.providerKind) {
      const strategy = this.liveStrategies.get(input.providerKind);
      if (strategy) {
        const liveMatches = await strategy.search({
          organizationId: input.organizationId,
          projectId: input.projectId,
          actorUserId: input.actorUserId,
          sourceLocale: input.sourceLocale,
          targetLocale: input.targetLocale,
          sourceText: input.sourceText,
        });

        if (liveMatches) {
          return {
            glossaryTerms: liveMatches.glossaryTerms.map(toCatGlossaryTerm),
            translationMemoryMatches: liveMatches.translationMemoryMatches.map((match) =>
              toCatTranslationMemoryMatch(match, input.sourceText),
            ),
          };
        }
      }
    }

    const [glossaryMatches, translationMemoryMatches] = await Promise.all([
      this.glossaryService.searchForContext({
        projectId: input.projectId,
        organizationId: input.organizationId,
        providerKind: input.providerKind ?? undefined,
        sourceLocale: input.sourceLocale,
        targetLocales: [input.targetLocale],
        sourceText: input.sourceText,
        glossaryMatchResolution: defaultGlossaryMatchResolution,
      }),
      this.memoryService.searchForContext({
        projectId: input.projectId,
        organizationId: input.organizationId,
        providerKind: input.providerKind ?? undefined,
        sourceLocale: input.sourceLocale,
        targetLocales: [input.targetLocale],
        sourceText: input.sourceText,
        translationMemoryMatchResolution: defaultTranslationMemoryMatchResolution,
      }),
    ]);

    return {
      glossaryTerms: glossaryMatches.map(toCatGlossaryTerm),
      translationMemoryMatches: translationMemoryMatches.map((match) =>
        toCatTranslationMemoryMatch(match, input.sourceText),
      ),
    };
  }
}

export class CatVisualContextService {
  async loadSegmentVisualContext(input: {
    organizationId: string;
    providerKind: ExternalTmsProviderKind;
    externalProjectId: string;
    externalStringId: string;
    sourcePath?: string;
    actorUserId?: string | null;
  }) {
    const context = await tryLoadActiveTmsProviderContext(input.organizationId, {
      actorUserId: input.actorUserId,
    });

    if (!context || context.providerKind !== input.providerKind) {
      return { screenshots: [] };
    }

    switch (input.providerKind) {
      case "crowdin": {
        const client = new CrowdinApiClient({
          token: context.secretMaterial,
          baseUrl: context.credential.baseUrl ?? undefined,
        });

        return crowdinTmsProvider.loadCatVisualContext({
          client,
          externalProjectId: input.externalProjectId,
          externalStringId: input.externalStringId,
        });
      }
      case "lokalise": {
        const client = new LokaliseApiClient({
          token: context.secretMaterial,
          baseUrl: context.credential.baseUrl ?? undefined,
        });

        return lokaliseTmsProvider.loadCatVisualContext({
          client,
          externalProjectId: input.externalProjectId,
          externalStringId: input.externalStringId,
        });
      }
      case "phrase": {
        const client = new PhraseApiClient({
          token: context.secretMaterial,
          region: context.credential.region,
          baseUrl: context.credential.baseUrl ?? undefined,
        });

        return phraseTmsProvider.loadCatVisualContext({
          client,
          externalProjectId: input.externalProjectId,
          externalStringId: input.externalStringId,
        });
      }
      case "smartling": {
        const client = new SmartlingApiClient({
          credentials: context.secretMaterial,
          authBaseUrl: context.credential.baseUrl ?? undefined,
        });

        return smartlingTmsProvider.loadCatVisualContext({
          client,
          externalProjectId: input.externalProjectId,
          externalStringId: input.externalStringId,
        });
      }
      default:
        return { screenshots: [] };
    }
  }
}

const defaultConcordanceService = new CatConcordanceService();
const defaultVisualContextService = new CatVisualContextService();

export async function loadCatSegmentConcordance(
  input: Parameters<CatConcordanceService["loadSegmentConcordance"]>[0],
) {
  return defaultConcordanceService.loadSegmentConcordance(input);
}

export async function loadCatSegmentVisualContext(
  input: Parameters<CatVisualContextService["loadSegmentVisualContext"]>[0],
) {
  return defaultVisualContextService.loadSegmentVisualContext(input);
}

export function mapCatConcordanceForAiRecommendation(
  concordance: CatConcordanceForAiRecommendation,
  targetLocale: string,
): Pick<CatAiRecommendationInput, "glossaryTerms" | "translationMemoryMatches"> {
  return {
    glossaryTerms: concordance.glossaryTerms.map((term) => ({
      sourceTerm: term.source,
      targetTerm: term.target,
      targetLocale,
      forbidden: term.forbidden,
      description: null,
    })),
    translationMemoryMatches: concordance.translationMemoryMatches.map((match) => ({
      sourceText: match.sourceText,
      targetText: match.targetText,
      targetLocale,
    })),
  };
}

export async function generateCatAiRecommendation(
  input: CatAiRecommendationInput,
): Promise<Result<CatAiRecommendationResult, CatAiRecommendationError>> {
  const modelResult = await loadOrganizationTranslationModel(input.projectId);
  if (!modelResult.ok) {
    return err({ code: modelResult.code, message: modelResult.message });
  }

  const hasPreloadedConcordance =
    input.glossaryTerms !== undefined || input.translationMemoryMatches !== undefined;

  const contextResult = await assembleStringTranslationContextSnapshot(
    input.projectId,
    {
      sourceLocale: input.sourceLocale,
      targetLocales: [input.targetLocale],
      sourceText: input.sourceText,
      context: input.context ?? undefined,
      maxLength: input.maxLength,
      metadata: {
        sourcePath: input.sourcePath,
        key: input.key,
      },
    },
    undefined,
    {
      organizationId: input.organizationId,
      glossaryMatchResolution: defaultGlossaryMatchResolution,
      translationMemoryMatchResolution: defaultTranslationMemoryMatchResolution,
      skipConcordance: hasPreloadedConcordance,
    },
  );

  if (!contextResult.ok) {
    return err({
      code: "translation_context_assembly_failed",
      message: contextResult.message,
    });
  }

  try {
    const recommendation = await new CatRecommendationEngine(modelResult.model).recommend(input, {
      projectName: contextResult.snapshot.project.name,
      projectTranslationContext: contextResult.snapshot.project.translationContext,
      knowledgeMemory: contextResult.snapshot.knowledgeMemory ?? undefined,
      glossaryTerms: input.glossaryTerms ?? contextResult.snapshot.glossaryTerms ?? [],
      translationMemoryMatches:
        input.translationMemoryMatches ?? contextResult.snapshot.translationMemoryMatches ?? [],
    });

    return ok(recommendation);
  } catch (error) {
    return err({
      code: "ai_recommendation_failed",
      message:
        error instanceof Error ? error.message : "Failed to generate AI translation recommendation",
    });
  }
}
