/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
export type DocumentGlossaryTerm = {
  id: string;
  source: string;
  target: string;
  approved: boolean;
  forbidden: boolean;
};

export type DocumentTranslationMemoryMatch = {
  id: string;
  sourceText: string;
  targetText: string;
  matchPercent: number;
  contextLabel?: string;
};

export type DocumentConcordance = {
  glossaryTerms: DocumentGlossaryTerm[];
  translationMemoryMatches: DocumentTranslationMemoryMatch[];
};

export type DocumentGlossaryWriteContext = {
  organizationSlug: string;
  projectId: string;
  teamId: string;
  teamName: string;
  teamGlossaries: { id: string; name: string; teamId: string }[];
  canContribute: boolean;
};

export type DocumentAssistantServices = {
  sourceLocale: string;
  targetLocale: string;
  /** Glossary and TM matches for a source phrase. */
  lookupConcordance: (sourceText: string) => Promise<DocumentConcordance>;
  /** Drafts a translation of one source block. Input and output are Markdown. */
  translateBlock: (input: {
    sourceMarkdown: string;
    targetMarkdown: string;
    instructions?: string;
  }) => Promise<{ suggestion: string; reasoning?: string }>;
  /** Lets the editor add a selected term to the project glossary. */
  glossary?: DocumentGlossaryWriteContext;
};

/** AI drafts depend on both the source block and its current translation. */
export function documentAssistantAiCacheKey(sourceMarkdown: string, targetMarkdown: string) {
  return `${sourceMarkdown}\0${targetMarkdown}`;
}
