import type { CatVisualContext } from "@/lib/translation/cat-visual-context";
import { CrowdinApiClient } from "@/lib/providers/adapters/crowdin/crowdin-api";
import { loadCrowdinCatVisualContext } from "@/lib/providers/adapters/crowdin/crowdin-cat-visual-context";
import { LokaliseApiClient } from "@/lib/providers/adapters/lokalise/lokalise-api";
import { loadLokaliseCatVisualContext } from "@/lib/providers/adapters/lokalise/lokalise-cat-visual-context";
import { loadPhraseCatVisualContext } from "@/lib/providers/adapters/phrase/phrase-cat-visual-context";
import { loadSmartlingCatVisualContext } from "@/lib/providers/adapters/smartling/smartling-cat-visual-context";
import { SmartlingApiClient } from "@/lib/providers/adapters/smartling/smartling-api";
import type { ExternalTmsProviderKind } from "@/lib/providers/contracts/external-tms-provider-kind";
import { tryLoadActiveTmsProviderContext } from "@/lib/providers/tms-provider-live";

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

      return loadCrowdinCatVisualContext({
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

      return loadLokaliseCatVisualContext({
        client,
        externalProjectId: input.externalProjectId,
        externalStringId: input.externalStringId,
      });
    }
    case "phrase":
      return loadPhraseCatVisualContext({
        token: context.secretMaterial,
        region: context.credential.region,
        baseUrl: context.credential.baseUrl ?? undefined,
        externalProjectId: input.externalProjectId,
        externalStringId: input.externalStringId,
      });
    case "smartling": {
      const client = new SmartlingApiClient({
        credentials: context.secretMaterial,
        authBaseUrl: context.credential.baseUrl ?? undefined,
      });

      return loadSmartlingCatVisualContext({
        client,
        externalProjectId: input.externalProjectId,
        externalStringId: input.externalStringId,
      });
    }
    default:
      return { screenshots: [] };
  }
}
