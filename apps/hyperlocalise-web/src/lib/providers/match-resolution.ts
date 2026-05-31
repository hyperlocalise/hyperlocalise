import { memorySupportsLiveSearch } from "@/lib/providers/contracts/memory-live-search";
import type { GlossaryMatchResolution } from "@/lib/providers/contracts/glossary-matcher";
import type { TranslationMemoryMatchResolution } from "@/lib/providers/contracts/translation-memory-matcher";
import { getProviderGlossaryMatcher } from "@/lib/providers/provider-glossary-matchers";
import { getProviderTranslationMemoryMatcher } from "@/lib/providers/provider-translation-memory-matchers";

export const defaultTranslationMemoryMatchResolution: TranslationMemoryMatchResolution = {
  getProviderTranslationMemoryMatcher,
  memorySupportsLiveSearch,
};

export const defaultGlossaryMatchResolution: GlossaryMatchResolution = {
  getProviderGlossaryMatcher,
};

export type { GlossaryMatchResolution, TranslationMemoryMatchResolution };
