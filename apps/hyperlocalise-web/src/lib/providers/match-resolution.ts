import { memorySupportsLiveSearch } from "@/lib/providers/contracts/memory-live-search";
import type { GlossaryMatchResolution } from "@/lib/providers/contracts/glossary-matcher";
import type { TranslationMemoryMatchResolution } from "@/lib/providers/contracts/translation-memory-matcher";
import {
  getProviderGlossaryMatcher,
  getProviderTranslationMemoryMatcher,
} from "@/lib/providers/adapters/tms-provider-adapter-registry";

export const defaultTranslationMemoryMatchResolution: TranslationMemoryMatchResolution = {
  getProviderTranslationMemoryMatcher,
  memorySupportsLiveSearch,
};

export const defaultGlossaryMatchResolution: GlossaryMatchResolution = {
  getProviderGlossaryMatcher,
};

export type { GlossaryMatchResolution, TranslationMemoryMatchResolution };
