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
import type { IntlShape } from "react-intl";

import {
  contentEditorIntelligencePanelMessages,
  contentEditorWorkspaceContainerMessages,
} from "@/components/content-editor/shared/content-editor.messages";
import type {
  ContentEditorSegmentConcordanceResult,
  ContentEditorWorkspaceServices,
} from "@/components/content-editor/shared/dependencies";

import type { ContentEditorWorkspaceOrchestrator } from "../content-editor-workspace-orchestrator";

export interface ContentEditorIntelligenceControllerPorts {
  intl: IntlShape;
  services?: ContentEditorWorkspaceServices;
}

export class ContentEditorIntelligenceController {
  private ports: ContentEditorIntelligenceControllerPorts;
  private loadedSegmentIds = new Set<string>();
  private concordanceAttempts = new Set<string>();
  private contextAttempts = new Set<string>();
  private contextGeneration = 0;
  private visualContextAttempts = new Set<string>();
  private inFlight = new Map<string, Promise<ContentEditorSegmentConcordanceResult | undefined>>();
  private concordanceGenerationBySegmentId = new Map<string, number>();
  private visualContextLoadingSegmentId: string | null = null;
  private disposed = false;

  constructor(
    private readonly workspace: ContentEditorWorkspaceOrchestrator,
    ports: ContentEditorIntelligenceControllerPorts,
  ) {
    this.ports = ports;
  }

  configure(ports: ContentEditorIntelligenceControllerPorts) {
    const previousServices = this.ports.services;
    this.ports = ports;
    if (previousServices?.lookupSegmentConcordance !== ports.services?.lookupSegmentConcordance) {
      this.loadedSegmentIds.clear();
      this.concordanceAttempts.clear();
      for (const segmentId of this.inFlight.keys()) {
        this.nextConcordanceGeneration(segmentId);
        this.workspace.endConcordanceLoad(segmentId);
      }
      this.inFlight.clear();
    }
    if (previousServices?.lookupSegmentContext !== ports.services?.lookupSegmentContext) {
      this.invalidateContextLookupGeneration();
      this.panelVisible(this.workspace.selectedSegmentId);
    }
    if (
      previousServices?.lookupSegmentVisualContext !== ports.services?.lookupSegmentVisualContext
    ) {
      this.visualContextAttempts.clear();
    }
  }

  start() {
    this.disposed = false;
  }

  dispose() {
    this.disposed = true;
    this.inFlight.clear();
  }

  async loadConcordance(
    segmentId: string,
  ): Promise<ContentEditorSegmentConcordanceResult | undefined> {
    const lookup = this.ports.services?.lookupSegmentConcordance;
    if (!lookup) {
      return undefined;
    }
    if (this.loadedSegmentIds.has(segmentId)) {
      const intelligence =
        this.workspace.segmentIntelligence[segmentId] ?? this.workspace.intelligence;
      return {
        glossaryTerms: intelligence.glossaryTerms ?? [],
        glossaryConcepts: intelligence.glossaryConcepts,
        translationMemoryMatches: intelligence.translationMemoryMatches ?? [],
      };
    }

    const existing = this.inFlight.get(segmentId);
    if (existing) {
      return existing;
    }

    const segment = this.workspace.getSegmentView(segmentId);
    if (!segment) {
      return undefined;
    }

    const generation = this.nextConcordanceGeneration(segmentId);
    const promise = (async () => {
      this.workspace.beginConcordanceLoad(segmentId);
      try {
        const concordance = await lookup(segment);
        if (this.disposed || !this.isCurrentConcordanceGeneration(segmentId, generation)) {
          return undefined;
        }
        this.loadedSegmentIds.add(segmentId);
        this.workspace.mergeSegmentIntelligence(segmentId, concordance);
        return concordance;
      } catch (error) {
        if (!this.disposed && this.isCurrentConcordanceGeneration(segmentId, generation)) {
          this.workspace.upsertFormatCheck(segmentId, {
            id: `concordance-failed-${segmentId}`,
            label: this.ports.intl.formatMessage(
              contentEditorWorkspaceContainerMessages.concordanceSearchLabel,
            ),
            status: "fail",
            message:
              error instanceof Error
                ? error.message
                : this.ports.intl.formatMessage(
                    contentEditorWorkspaceContainerMessages.concordanceSearchFailed,
                  ),
            category: "qa",
          });
        }
        return undefined;
      } finally {
        if (this.isCurrentConcordanceGeneration(segmentId, generation)) {
          this.workspace.endConcordanceLoad(segmentId);
          this.inFlight.delete(segmentId);
        }
      }
    })();
    this.inFlight.set(segmentId, promise);
    return promise;
  }

  async reloadConcordance(segmentId: string) {
    this.nextConcordanceGeneration(segmentId);
    this.loadedSegmentIds.delete(segmentId);
    this.concordanceAttempts.delete(segmentId);
    this.inFlight.delete(segmentId);
    return this.loadConcordance(segmentId);
  }

  panelVisible(segmentId: string) {
    const segment = this.workspace.getSegmentView(segmentId);
    if (!segment) {
      return;
    }

    const { lookupSegmentConcordance, lookupSegmentContext, lookupSegmentVisualContext } =
      this.ports.services ?? {};
    if (lookupSegmentConcordance && !this.concordanceAttempts.has(segmentId)) {
      this.concordanceAttempts.add(segmentId);
      void this.loadConcordance(segmentId);
    }

    if (
      lookupSegmentContext &&
      this.workspace.segmentIntelligence[segmentId]?.agentContext === undefined &&
      !this.contextAttempts.has(segmentId)
    ) {
      const contextGeneration = this.contextGeneration;
      this.contextAttempts.add(segmentId);
      void lookupSegmentContext(segment, { cachedOnly: true })
        .then((agentContext) => {
          if (
            this.disposed ||
            contextGeneration !== this.contextGeneration ||
            !agentContext?.trim()
          ) {
            return;
          }
          this.workspace.mergeSegmentIntelligence(segmentId, { agentContext });
          this.workspace.revealAgentContext(segmentId);
          this.workspace.removeFormatCheck(segmentId, `context-lookup-failed-${segmentId}`);
        })
        .catch(() => undefined);
    }

    if (
      !lookupSegmentVisualContext ||
      !this.workspace.providerKind ||
      this.workspace.providerKind === "native"
    ) {
      return;
    }
    if (this.workspace.segmentIntelligence[segmentId]?.visualContext) {
      this.workspace.isLoadingVisualContext = false;
      this.visualContextLoadingSegmentId = null;
      return;
    }
    if (this.visualContextAttempts.has(segmentId)) {
      return;
    }

    this.visualContextAttempts.add(segmentId);
    this.workspace.isLoadingVisualContext = true;
    this.visualContextLoadingSegmentId = segmentId;
    void lookupSegmentVisualContext(segment)
      .then((visualContext) => {
        if (!this.disposed) {
          this.workspace.mergeSegmentIntelligence(segmentId, { visualContext });
        }
      })
      .catch(() => {
        if (!this.disposed) {
          this.workspace.upsertFormatCheck(segmentId, {
            id: `visual-context-failed-${segmentId}`,
            label: this.ports.intl.formatMessage(contentEditorIntelligencePanelMessages.panelTitle),
            status: "warn",
            message: this.ports.intl.formatMessage(
              contentEditorWorkspaceContainerMessages.visualContextLoadFailed,
            ),
            category: "qa",
          });
        }
      })
      .finally(() => {
        if (segmentId === this.visualContextLoadingSegmentId) {
          this.workspace.isLoadingVisualContext = false;
          this.visualContextLoadingSegmentId = null;
        }
      });
  }

  async askQuestion(segmentId: string, options?: { forceRefresh?: boolean }): Promise<boolean> {
    const lookup = this.ports.services?.lookupSegmentContext;
    if (!lookup) {
      return false;
    }
    const segment = this.workspace.getSegmentView(segmentId);
    if (!segment) {
      return false;
    }
    const existingAgentContext = this.workspace.segmentIntelligence[segmentId]?.agentContext;
    const contextGeneration = this.contextGeneration;
    this.workspace.revealAgentContext(segmentId);
    if (existingAgentContext?.trim() && !options?.forceRefresh) {
      return false;
    }

    this.workspace.beginContextLookup(segmentId);
    try {
      const agentContext = await lookup(segment, {
        forceRefresh: options?.forceRefresh === true,
      });
      if (this.disposed || contextGeneration !== this.contextGeneration) {
        return false;
      }
      this.workspace.removeFormatCheck(segmentId, `context-lookup-failed-${segmentId}`);
      this.workspace.mergeSegmentIntelligence(segmentId, { agentContext });
      return Boolean(agentContext?.trim());
    } catch (error) {
      if (!this.disposed && contextGeneration === this.contextGeneration) {
        this.workspace.upsertFormatCheck(segmentId, {
          id: `context-lookup-failed-${segmentId}`,
          label: this.ports.intl.formatMessage(
            contentEditorWorkspaceContainerMessages.contextLookupLabel,
          ),
          status: "fail",
          message:
            error instanceof Error
              ? error.message
              : this.ports.intl.formatMessage(
                  contentEditorWorkspaceContainerMessages.contextLookupFailed,
                ),
          category: "qa",
        });
      }
      return false;
    } finally {
      if (contextGeneration === this.contextGeneration) {
        this.workspace.endContextLookup(segmentId);
      }
    }
  }

  private nextConcordanceGeneration(segmentId: string) {
    const generation = (this.concordanceGenerationBySegmentId.get(segmentId) ?? 0) + 1;
    this.concordanceGenerationBySegmentId.set(segmentId, generation);
    return generation;
  }

  private isCurrentConcordanceGeneration(segmentId: string, generation: number) {
    return this.concordanceGenerationBySegmentId.get(segmentId) === generation;
  }

  private invalidateContextLookupGeneration() {
    this.contextAttempts.clear();
    // clearAgentContexts resets contextLoadingSegmentIds; increment invalidates in-flight
    // askQuestion handlers whose finally blocks skip endContextLookup on stale generations.
    this.workspace.clearAgentContexts();
    this.contextGeneration += 1;
  }
}
