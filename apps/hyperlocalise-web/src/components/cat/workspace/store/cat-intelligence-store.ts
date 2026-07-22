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
  formatCheckLoadingSegmentIds = new Set<string>();

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true });
  }

  setFormatCheckLoading(segmentId: string, loading: boolean) {
    if (loading) {
      if (this.formatCheckLoadingSegmentIds.has(segmentId)) {
        return;
      }
      this.formatCheckLoadingSegmentIds = new Set(this.formatCheckLoadingSegmentIds).add(segmentId);
      return;
    }

    if (!this.formatCheckLoadingSegmentIds.has(segmentId)) {
      return;
    }

    const next = new Set(this.formatCheckLoadingSegmentIds);
    next.delete(segmentId);
    this.formatCheckLoadingSegmentIds = next;
  }

  clearFormatCheckLoading() {
    if (this.formatCheckLoadingSegmentIds.size === 0) {
      return;
    }
    this.formatCheckLoadingSegmentIds = new Set();
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
}
