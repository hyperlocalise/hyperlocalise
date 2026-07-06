import type { IntlShape } from "react-intl";

import {
  selectBestTmMatchForAutoFill,
  TM_AUTO_FILL_MIN_MATCH_PERCENT_DEFAULT,
} from "@/components/cat/intelligence/tm-match-quality";
import {
  catIntelligencePanelMessages,
  catWorkspaceContainerMessages,
} from "@/components/cat/shared/cat.messages";
import type {
  CatSegmentConcordanceResult,
  CatWorkspaceEditing,
  CatWorkspaceServices,
} from "@/components/cat/shared/dependencies";

import type { CatWorkspaceOrchestrator } from "../cat-workspace-orchestrator";

export interface CatIntelligenceControllerPorts {
  intl: IntlShape;
  services?: CatWorkspaceServices;
  editing?: Partial<CatWorkspaceEditing>;
  tmAutoFillMinMatchPercent?: number;
}

export class CatIntelligenceController {
  private ports: CatIntelligenceControllerPorts;
  private loadedSegmentIds = new Set<string>();
  private concordanceAttempts = new Set<string>();
  private contextAttempts = new Set<string>();
  private contextGeneration = 0;
  private visualContextAttempts = new Set<string>();
  private inFlight = new Map<
    string,
    {
      autoFill: boolean;
      promise: Promise<CatSegmentConcordanceResult | undefined>;
    }
  >();
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

  async loadConcordance(
    segmentId: string,
    options?: { autoFill?: boolean },
  ): Promise<CatSegmentConcordanceResult | undefined> {
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
      if (options?.autoFill !== false) {
        existing.autoFill = true;
      }
      return existing.promise;
    }

    const segment = this.workspace.getSegmentView(segmentId);
    if (!segment) {
      return undefined;
    }

    const entry = {
      autoFill: options?.autoFill !== false,
      promise: Promise.resolve(undefined) as Promise<CatSegmentConcordanceResult | undefined>,
    };
    entry.promise = (async () => {
      this.workspace.beginConcordanceLoad(segmentId);
      try {
        const concordance = await lookup(segment);
        if (this.disposed) {
          return undefined;
        }
        this.loadedSegmentIds.add(segmentId);
        this.workspace.mergeSegmentIntelligence(segmentId, concordance);
        if (this.inFlight.get(segmentId)?.autoFill) {
          this.applyAutoFill(segmentId, concordance);
        }
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
    this.inFlight.set(segmentId, entry);
    return entry.promise;
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

  async askQuestion(segmentId: string, options?: { forceRefresh?: boolean }) {
    const lookup = this.ports.services?.lookupSegmentContext;
    if (!lookup) {
      return;
    }
    const segment = this.workspace.getSegmentView(segmentId);
    if (!segment) {
      return;
    }
    const existingAgentContext = this.workspace.segmentIntelligence[segmentId]?.agentContext;
    const contextGeneration = this.contextGeneration;
    this.workspace.revealAgentContext(segmentId);
    if (existingAgentContext?.trim() && !options?.forceRefresh) {
      return;
    }

    this.workspace.beginContextLookup(segmentId);
    try {
      const agentContext = await lookup(segment, {
        forceRefresh: options?.forceRefresh === true,
      });
      if (this.disposed || contextGeneration !== this.contextGeneration) {
        return;
      }
      this.workspace.removeFormatCheck(segmentId, `context-lookup-failed-${segmentId}`);
      this.workspace.mergeSegmentIntelligence(segmentId, { agentContext });
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

  private applyAutoFill(segmentId: string, concordance: CatSegmentConcordanceResult) {
    const segment = this.workspace.getSegmentView(segmentId);
    const bestMatch = selectBestTmMatchForAutoFill(
      concordance.translationMemoryMatches,
      this.ports.tmAutoFillMinMatchPercent ?? TM_AUTO_FILL_MIN_MATCH_PERCENT_DEFAULT,
    );
    if (
      !segment ||
      segment.targetText.trim() ||
      !bestMatch ||
      this.workspace.autoFilledSegmentIds.has(segmentId)
    ) {
      return;
    }

    this.workspace.autoFilledSegmentIds.add(segmentId);
    this.workspace.setTargetText(segmentId, bestMatch.targetText);
    this.workspace.markSegmentSaved(segmentId, bestMatch.targetText);
    this.ports.editing?.onTargetChange?.(segmentId, bestMatch.targetText);
  }
}
