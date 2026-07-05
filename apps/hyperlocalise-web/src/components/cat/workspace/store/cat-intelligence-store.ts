import { makeAutoObservable } from "mobx";

import type { CatFormatCheck, CatSegmentIntelligence } from "@/components/cat/shared/types";

export class CatIntelligenceStore {
  formatChecks: CatFormatCheck[] = [];
  segmentFormatChecks: Record<string, CatFormatCheck[]> = {};
  fileIntelligence: CatSegmentIntelligence = { glossaryTerms: [] };
  bySegment: Record<string, CatSegmentIntelligence> = {};
  revealedAgentContextSegmentIds = new Set<string>();
  contextLoadingSegmentIds = new Set<string>();

  concordanceLoadingSegmentId: string | null = null;
  isLoadingVisualContext = false;
  isGeneratingAiRecommendation = false;
  isRunningFormatChecks = false;
  isValidating = false;

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true });
  }

  setChecks(segmentId: string, checks: CatFormatCheck[], isSelected: boolean) {
    this.segmentFormatChecks = { ...this.segmentFormatChecks, [segmentId]: checks };
    if (isSelected) {
      this.formatChecks = checks;
    }
  }

  setSegment(segmentId: string, intelligence: CatSegmentIntelligence) {
    this.bySegment = { ...this.bySegment, [segmentId]: intelligence };
  }

  mergeSegment(segmentId: string, patch: Partial<CatSegmentIntelligence>) {
    const current = this.bySegment[segmentId] ?? this.fileIntelligence;
    this.setSegment(segmentId, { ...current, ...patch });
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
}
