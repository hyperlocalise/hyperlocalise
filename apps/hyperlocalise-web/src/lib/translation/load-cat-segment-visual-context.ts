import type { CatVisualContext } from "@/lib/translation/cat-visual-context";
import { CrowdinApiClient } from "@/lib/providers/adapters/crowdin/crowdin-api";
import { crowdinTmsProvider } from "@/lib/providers/adapters/crowdin/crowdin-provider";
import { LokaliseApiClient } from "@/lib/providers/adapters/lokalise/lokalise-api";
import { lokaliseTmsProvider } from "@/lib/providers/adapters/lokalise/lokalise-provider";
import { PhraseApiClient } from "@/lib/providers/adapters/phrase/phrase-api";
import { phraseTmsProvider } from "@/lib/providers/adapters/phrase/phrase-provider";
import { SmartlingApiClient } from "@/lib/providers/adapters/smartling/smartling-api";
import { smartlingTmsProvider } from "@/lib/providers/adapters/smartling/smartling-provider";
import type { ExternalTmsProviderKind } from "@/lib/providers/contracts/external-tms-provider-kind";
import { tryLoadActiveTmsProviderContext } from "@/lib/providers/jobs/tms-provider-live";

export async function loadCatSegmentVisualContext(input: {
  organizationId: string;
  providerKind: ExternalTmsProviderKind;
  externalProjectId: string;
  externalStringId: string;
  // Kept at this boundary for provider implementations that need file-scoped lookups.
  sourcePath?: string;
  actorUserId?: string | null;
}): Promise<CatVisualContext> {
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
