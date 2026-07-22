/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { memorySupportsLiveSearch } from "@/lib/providers/contracts/memory-live-search";
import type { GlossaryMatchResolution } from "@/lib/providers/contracts/glossary-matcher";
import type { TranslationMemoryMatchResolution } from "@/lib/providers/contracts/translation-memory-matcher";
import {
  getProviderGlossaryMatcher,
  getProviderTranslationMemoryMatcher,
} from "@/lib/providers/adapters/tms-provider-registry";

export const defaultTranslationMemoryMatchResolution: TranslationMemoryMatchResolution = {
  getProviderTranslationMemoryMatcher,
  memorySupportsLiveSearch,
};

export const defaultGlossaryMatchResolution: GlossaryMatchResolution = {
  getProviderGlossaryMatcher,
};

export type { GlossaryMatchResolution, TranslationMemoryMatchResolution };
