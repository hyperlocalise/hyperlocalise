import { getTmsProvider } from "@/lib/providers/adapters/tms-provider-registry";
import {
  providerSupportsGlossaryMatch,
  providerSupportsTranslationMemoryMatch,
} from "@/lib/providers/adapters/tms-provider-registry";
import { isTmsProviderFeatureSupported } from "@/lib/providers/contracts/tms-provider";
import type { ExternalTmsProviderKind } from "@/lib/providers/contracts/external-tms-provider-kind";
import { memorySupportsLiveSearch } from "@/lib/providers/contracts/memory-live-search";

export type CatResourceType = "file" | "key";

export type TranslationProviderFeature =
  | "live_glossary_search"
  | "live_translation_memory_search"
  | "cat_concordance"
  | "cat_visual_context"
  | "user_scoped_auth";

export class TranslationProviderCapabilityCatalog {
  supportsLiveGlossarySearch(providerKind: ExternalTmsProviderKind): boolean {
    return providerSupportsGlossaryMatch(providerKind);
  }

  supportsLiveTranslationMemorySearch(
    providerKind: ExternalTmsProviderKind,
    memory: {
      capabilityMode: string | null;
      externalProviderKind: string | null;
    },
  ): boolean {
    return providerSupportsTranslationMemoryMatch(providerKind) && memorySupportsLiveSearch(memory);
  }

  supportsCatResource(
    providerKind: ExternalTmsProviderKind,
    resourceType: CatResourceType,
  ): boolean {
    const provider = getTmsProvider(providerKind);
    return provider?.resourceSupport?.providerCat?.[resourceType] ?? false;
  }

  supportsCatConcordance(providerKind: ExternalTmsProviderKind): boolean {
    const provider = getTmsProvider(providerKind);
    if (!provider?.features) {
      return false;
    }

    return isTmsProviderFeatureSupported(provider.features["cat.open"]);
  }

  supportsVisualContext(providerKind: ExternalTmsProviderKind): boolean {
    const provider = getTmsProvider(providerKind);
    if (!provider?.features) {
      return false;
    }

    return isTmsProviderFeatureSupported(provider.features["cat.visual_context"]);
  }

  requiresUserScopedAuth(providerKind: ExternalTmsProviderKind): boolean {
    const provider = getTmsProvider(providerKind);
    return provider?.auth?.userConnection ?? false;
  }

  supportsFeature(
    providerKind: ExternalTmsProviderKind,
    feature: TranslationProviderFeature,
  ): boolean {
    switch (feature) {
      case "live_glossary_search":
        return this.supportsLiveGlossarySearch(providerKind);
      case "live_translation_memory_search":
        return providerSupportsTranslationMemoryMatch(providerKind);
      case "cat_concordance":
        return this.supportsCatConcordance(providerKind);
      case "cat_visual_context":
        return this.supportsVisualContext(providerKind);
      case "user_scoped_auth":
        return this.requiresUserScopedAuth(providerKind);
    }
  }
}

export const translationProviderCapabilities = new TranslationProviderCapabilityCatalog();
