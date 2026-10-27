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
import { makeAutoObservable } from "mobx";

import type {
  ContentEditorFormatCheck,
  ContentEditorSegmentIntelligence,
} from "@/components/content-editor/shared/types";
import type { GlossaryTermStatus } from "@/lib/glossary/glossary";

export type ContentEditorGlossaryWizardGlossary = {
  id: string;
  name: string;
  teamId: string;
};

export type ContentEditorGlossaryTermMetadataDraft = {
  partOfSpeech: string;
  gender: string | null;
  termType: string | null;
  status: GlossaryTermStatus;
};

export const preferredGlossaryTermMetadataDraft: ContentEditorGlossaryTermMetadataDraft = {
  partOfSpeech: "",
  gender: null,
  termType: null,
  status: "preferred",
};

function cloneGlossaryTermMetadata(
  draft: ContentEditorGlossaryTermMetadataDraft,
): ContentEditorGlossaryTermMetadataDraft {
  return { ...draft };
}

export class ContentEditorIntelligenceStore {
  formatChecks: ContentEditorFormatCheck[] = [];
  segmentFormatChecks: Record<string, ContentEditorFormatCheck[]> = {};
  fileIntelligence: ContentEditorSegmentIntelligence = { glossaryTerms: [] };
  bySegment: Record<string, ContentEditorSegmentIntelligence> = {};
  revealedAgentContextSegmentIds = new Set<string>();
  contextLoadingSegmentIds = new Set<string>();

  concordanceLoadingSegmentId: string | null = null;
  isLoadingVisualContext = false;
  isGeneratingAiRecommendation = false;
  isRunningFormatChecks = false;
  isValidating = false;
  formatCheckLoadingSegmentIds = new Set<string>();

  glossaryCreated: ContentEditorGlossaryWizardGlossary[] = [];
  glossarySelectedId = "";
  glossaryCreateDialogOpen = false;
  glossaryNewName = "";
  glossaryPrimaryTerm = "";
  glossaryDefinition = "";
  glossaryTranslatable = true;
  glossaryTargetDraft = "";
  glossarySourceMetadata: ContentEditorGlossaryTermMetadataDraft = cloneGlossaryTermMetadata(
    preferredGlossaryTermMetadataDraft,
  );
  glossaryTargetMetadata: ContentEditorGlossaryTermMetadataDraft = cloneGlossaryTermMetadata(
    preferredGlossaryTermMetadataDraft,
  );

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true });
  }

  setFormatCheckLoading(segmentId: string, loading: boolean) {
    if (loading) {
      if (this.formatCheckLoadingSegmentIds.has(segmentId)) {
        return;
      }
      this.formatCheckLoadingSegmentIds.add(segmentId);
      return;
    }

    if (!this.formatCheckLoadingSegmentIds.has(segmentId)) {
      return;
    }

    this.formatCheckLoadingSegmentIds.delete(segmentId);
  }

  clearFormatCheckLoading() {
    if (this.formatCheckLoadingSegmentIds.size === 0) {
      return;
    }
    this.formatCheckLoadingSegmentIds = new Set();
  }

  /** Drops everything that belonged to the previous file or locale. */
  resetForFileScope() {
    this.formatChecks = [];
    this.segmentFormatChecks = {};
    this.bySegment = {};
    this.isValidating = false;
    this.isGeneratingAiRecommendation = false;
    this.isRunningFormatChecks = false;
    this.isLoadingVisualContext = false;
  }

  setFileIntelligence(intelligence: ContentEditorSegmentIntelligence) {
    this.fileIntelligence = intelligence;
  }

  replaceSegments(bySegment: Record<string, ContentEditorSegmentIntelligence>) {
    this.bySegment = bySegment;
  }

  /** Checks shown for the selected segment. */
  setSelectedChecks(checks: ContentEditorFormatCheck[]) {
    this.formatChecks = checks;
  }

  replaceSegmentChecks(segmentFormatChecks: Record<string, ContentEditorFormatCheck[]>) {
    this.segmentFormatChecks = segmentFormatChecks;
  }

  revealAgentContexts(segmentIds: Iterable<string>) {
    this.revealedAgentContextSegmentIds = new Set([
      ...this.revealedAgentContextSegmentIds,
      ...segmentIds,
    ]);
  }

  setValidating(validating: boolean) {
    this.isValidating = validating;
  }

  setGeneratingAiRecommendation(generating: boolean) {
    this.isGeneratingAiRecommendation = generating;
  }

  setRunningFormatChecks(running: boolean) {
    this.isRunningFormatChecks = running;
  }

  setLoadingVisualContext(loading: boolean) {
    this.isLoadingVisualContext = loading;
  }

  beginConcordanceLoad(segmentId: string) {
    this.concordanceLoadingSegmentId = segmentId;
  }

  endConcordanceLoad(segmentId: string) {
    if (this.concordanceLoadingSegmentId === segmentId) {
      this.concordanceLoadingSegmentId = null;
    }
  }

  setChecks(segmentId: string, checks: ContentEditorFormatCheck[], isSelected: boolean) {
    this.segmentFormatChecks[segmentId] = checks;
    if (isSelected) {
      this.formatChecks = checks;
    }
  }

  setSegment(segmentId: string, intelligence: ContentEditorSegmentIntelligence) {
    this.bySegment[segmentId] = intelligence;
  }

  mergeSegment(segmentId: string, patch: Partial<ContentEditorSegmentIntelligence>) {
    const current = this.bySegment[segmentId] ?? this.fileIntelligence;
    this.setSegment(segmentId, { ...current, ...patch });
  }

  clearAgentContexts() {
    this.bySegment = Object.fromEntries(
      Object.entries(this.bySegment).map(([segmentId, intelligence]) => [
        segmentId,
        { ...intelligence, agentContext: undefined },
      ]),
    );
    this.revealedAgentContextSegmentIds = new Set();
    this.contextLoadingSegmentIds = new Set();
    this.segmentFormatChecks = Object.fromEntries(
      Object.entries(this.segmentFormatChecks).map(([segmentId, checks]) => [
        segmentId,
        checks.filter((check) => !check.id.startsWith("context-lookup-failed-")),
      ]),
    );
    this.formatChecks = this.formatChecks.filter(
      (check) => !check.id.startsWith("context-lookup-failed-"),
    );
  }

  revealAgentContext(segmentId: string) {
    this.revealedAgentContextSegmentIds.add(segmentId);
  }

  beginContextLookup(segmentId: string) {
    this.contextLoadingSegmentIds.add(segmentId);
  }

  endContextLookup(segmentId: string) {
    this.contextLoadingSegmentIds.delete(segmentId);
  }

  primeGlossaryWizard(input: {
    sourceTerm: string;
    targetTerm: string;
    selectedGlossaryId: string;
    defaultGlossaryName: string;
  }) {
    this.glossarySelectedId = input.selectedGlossaryId;
    this.glossaryNewName = input.defaultGlossaryName;
    this.glossaryPrimaryTerm = input.sourceTerm;
    this.glossaryDefinition = "";
    this.glossaryTranslatable = true;
    this.glossaryTargetDraft = input.targetTerm;
    this.glossarySourceMetadata = cloneGlossaryTermMetadata(preferredGlossaryTermMetadataDraft);
    this.glossaryTargetMetadata = cloneGlossaryTermMetadata(preferredGlossaryTermMetadataDraft);
    this.glossaryCreateDialogOpen = false;
  }

  setGlossarySelectedId(glossaryId: string) {
    this.glossarySelectedId = glossaryId;
  }

  setGlossaryCreateDialogOpen(open: boolean, defaultGlossaryName?: string) {
    this.glossaryCreateDialogOpen = open;
    if (open && defaultGlossaryName !== undefined) {
      this.glossaryNewName = defaultGlossaryName;
    }
  }

  setGlossaryNewName(name: string) {
    this.glossaryNewName = name;
  }

  setGlossaryPrimaryTerm(term: string) {
    this.glossaryPrimaryTerm = term;
  }

  setGlossaryDefinition(definition: string) {
    this.glossaryDefinition = definition;
  }

  setGlossaryTranslatable(translatable: boolean) {
    this.glossaryTranslatable = translatable;
  }

  setGlossaryTargetDraft(term: string) {
    this.glossaryTargetDraft = term;
  }

  setGlossarySourceMetadata(draft: ContentEditorGlossaryTermMetadataDraft) {
    this.glossarySourceMetadata = cloneGlossaryTermMetadata(draft);
  }

  setGlossaryTargetMetadata(draft: ContentEditorGlossaryTermMetadataDraft) {
    this.glossaryTargetMetadata = cloneGlossaryTermMetadata(draft);
  }

  rememberCreatedGlossary(glossary: ContentEditorGlossaryWizardGlossary) {
    if (this.glossaryCreated.some((item) => item.id === glossary.id)) {
      this.glossarySelectedId = glossary.id;
      this.glossaryCreateDialogOpen = false;
      return;
    }
    this.glossaryCreated = [...this.glossaryCreated, glossary];
    this.glossarySelectedId = glossary.id;
    this.glossaryCreateDialogOpen = false;
  }
}
