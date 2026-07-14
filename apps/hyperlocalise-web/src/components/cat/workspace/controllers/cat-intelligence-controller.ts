import type { IntlShape } from "react-intl";

import {
  catIntelligencePanelMessages,
  catWorkspaceContainerMessages,
} from "@/components/cat/shared/cat.messages";
import type {
  CatSegmentConcordanceResult,
  CatWorkspaceServices,
} from "@/components/cat/shared/dependencies";

import type { CatWorkspaceOrchestrator } from "../cat-workspace-orchestrator";

export interface CatIntelligenceControllerPorts {
  intl: IntlShape;
  services?: CatWorkspaceServices;
}

export class CatIntelligenceController {
  private ports: CatIntelligenceControllerPorts;
  private loadedSegmentIds = new Set<string>();
  private concordanceAttempts = new Set<string>();
  private contextAttempts = new Set<string>();
  private contextGeneration = 0;
  private visualContextAttempts = new Set<string>();
  private inFlight = new Map<string, Promise<CatSegmentConcordanceResult | undefined>>();
  private visualContextLoadingSegmentId: string | null = null;
  private disposed = false;

  constructor(
    private readonly workspace: CatWorkspaceOrchestrator,
    ports: CatIntelligenceControllerPorts,
  ) {
    this.ports = ports;
  }

  configure(ports: CatIntelligenceControllerPorts) {
    const previousServices = this.ports.services;
    this.ports = ports;
    if (previousServices?.lookupSegmentConcordance !== ports.services?.lookupSegmentConcordance) {
      this.loadedSegmentIds.clear();
      this.concordanceAttempts.clear();
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

  async loadConcordance(segmentId: string): Promise<CatSegmentConcordanceResult | undefined> {
    const lookup = this.ports.services?.lookupSegmentConcordance;
    if (!lookup) {
      return undefined;
    }
    if (this.loadedSegmentIds.has(segmentId)) {
      const intelligence =
        this.workspace.segmentIntelligence[segmentId] ?? this.workspace.intelligence;
      return {
        glossaryTerms: intelligence.glossaryTerms ?? [],
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

    const promise = (async () => {
      this.workspace.beginConcordanceLoad(segmentId);
      try {
        const concordance = await lookup(segment);
        if (this.disposed) {
          return undefined;
        }
        this.loadedSegmentIds.add(segmentId);
        this.workspace.mergeSegmentIntelligence(segmentId, concordance);
        return concordance;
      } catch (error) {
        if (!this.disposed) {
          this.workspace.upsertFormatCheck(segmentId, {
            id: `concordance-failed-${segmentId}`,
            label: this.ports.intl.formatMessage(
              catWorkspaceContainerMessages.concordanceSearchLabel,
            ),
            status: "fail",
            message:
              error instanceof Error
                ? error.message
                : this.ports.intl.formatMessage(
                    catWorkspaceContainerMessages.concordanceSearchFailed,
                  ),
            category: "qa",
          });
        }
        return undefined;
      } finally {
        this.workspace.endConcordanceLoad(segmentId);
        this.inFlight.delete(segmentId);
      }
    })();
    this.inFlight.set(segmentId, promise);
    return promise;
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
            label: this.ports.intl.formatMessage(catIntelligencePanelMessages.panelTitle),
            status: "warn",
            message: this.ports.intl.formatMessage(
              catWorkspaceContainerMessages.visualContextLoadFailed,
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
          label: this.ports.intl.formatMessage(catWorkspaceContainerMessages.contextLookupLabel),
          status: "fail",
          message:
            error instanceof Error
              ? error.message
              : this.ports.intl.formatMessage(catWorkspaceContainerMessages.contextLookupFailed),
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

  private invalidateContextLookupGeneration() {
    this.contextAttempts.clear();
    // clearAgentContexts resets contextLoadingSegmentIds; increment invalidates in-flight
    // askQuestion handlers whose finally blocks skip endContextLookup on stale generations.
    this.workspace.clearAgentContexts();
    this.contextGeneration += 1;
  }
}
