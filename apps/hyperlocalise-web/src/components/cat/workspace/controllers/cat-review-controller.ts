import { reaction, type IReactionDisposer } from "mobx";
import type { IntlShape } from "react-intl";

import type { CatQueueFilter } from "@/components/cat/queue/cat-queue-filter";
import {
  catEditorPanelMessages,
  catWorkspaceContainerMessages,
} from "@/components/cat/shared/cat.messages";
import type {
  CatAiRecommendationResult,
  CatSegmentConcordanceResult,
  CatWorkspaceReview,
  CatWorkspaceServices,
} from "@/components/cat/shared/dependencies";
import type {
  CatFormatCheck,
  CatGlossaryTerm,
  CatSegment,
  CatSegmentCommentInput,
  CatSegmentStatus,
} from "@/components/cat/shared/types";

import type { CatWorkspaceOrchestrator } from "../cat-workspace-orchestrator";
import { glossaryTermsForSegment } from "../store/cat-workspace-store-utils";

export interface CatReviewControllerPorts {
  intl: IntlShape;
  services?: CatWorkspaceServices;
  review?: Partial<CatWorkspaceReview>;
  loadConcordance?: (
    segmentId: string,
    options?: { autoFill?: boolean },
  ) => Promise<CatSegmentConcordanceResult | undefined>;
  queueFilter: CatQueueFilter;
  usesServerQueueFilter: boolean;
}

export class CatReviewController {
  private ports: CatReviewControllerPorts;
  private selectedSegmentDisposer?: IReactionDisposer;
  private disposed = false;

  constructor(
    private readonly workspace: CatWorkspaceOrchestrator,
    ports: CatReviewControllerPorts,
  ) {
    this.ports = ports;
  }

  configure(ports: CatReviewControllerPorts) {
    this.ports = ports;
  }

  start() {
    this.disposed = false;
    this.selectedSegmentDisposer?.();
    this.selectedSegmentDisposer = reaction(
      () => this.workspace.selectedSegmentId,
      (segmentId) => {
        if (segmentId && this.canRunChecks) {
          void this.runReview(segmentId, { includeAi: false });
        }
      },
      { fireImmediately: true },
    );
  }

  dispose() {
    this.disposed = true;
    this.selectedSegmentDisposer?.();
    this.selectedSegmentDisposer = undefined;
  }

  get canRunChecks() {
    return Boolean(this.ports.services?.validateFormat || this.ports.services?.runQaChecks);
  }

  async runChecks(segment: CatSegment, value: string, glossaryTermsOverride?: CatGlossaryTerm[]) {
    const { validateFormat, runQaChecks } = this.ports.services ?? {};
    if (!validateFormat && !runQaChecks) {
      return;
    }

    const sequence = this.workspace.beginValidation();
    try {
      const glossaryTerms =
        glossaryTermsOverride ?? glossaryTermsForSegment(this.workspace.shellState, segment.id);
      const [formatChecks, qaChecks] = await Promise.all([
        validateFormat ? validateFormat(segment, value, glossaryTerms) : Promise.resolve([]),
        runQaChecks ? runQaChecks(segment, value) : Promise.resolve([]),
      ]);
      if (this.disposed || !this.workspace.isValidationCurrent(sequence)) {
        return;
      }
      this.workspace.setFormatChecks(
        segment.id,
        [...formatChecks, ...qaChecks],
        this.workspace.selectedSegmentId === segment.id,
      );
    } finally {
      this.workspace.completeValidation(sequence);
    }
  }

  async runReview(segmentId: string, options?: { includeAi?: boolean }) {
    const segment = this.workspace.getSegmentView(segmentId);
    if (!segment) {
      return;
    }

    const { generateAiRecommendation, lookupSegmentConcordance, validateFormat, runQaChecks } =
      this.ports.services ?? {};
    const includeAi = options?.includeAi === true && Boolean(generateAiRecommendation);
    const includeFormatChecks = Boolean(validateFormat || runQaChecks);
    if (!includeAi && !includeFormatChecks) {
      return;
    }

    await this.ports.review?.onReviewWithAi?.(segmentId);
    const sequence = this.workspace.beginReview({
      includeAi,
      showFormatChecksLoading: includeFormatChecks && !includeAi,
    });

    try {
      if (includeAi && lookupSegmentConcordance) {
        await this.ports.loadConcordance?.(segmentId, { autoFill: false });
        if (this.disposed || !this.workspace.isReviewCurrent(sequence)) {
          return;
        }
      }

      const intelligence =
        this.workspace.segmentIntelligence[segmentId] ?? this.workspace.intelligence;
      const segmentForReview = this.workspace.getSegmentView(segmentId) ?? segment;
      let recommendation: CatAiRecommendationResult | undefined;
      let aiFailureCheck: CatFormatCheck | undefined;

      if (includeAi && generateAiRecommendation) {
        try {
          recommendation = await generateAiRecommendation(
            segmentForReview,
            segmentForReview.targetText,
            intelligence,
          );
        } catch (error) {
          if (this.disposed || !this.workspace.isReviewCurrent(sequence)) {
            return;
          }
          aiFailureCheck = {
            id: `ai-recommendation-failed-${segmentId}`,
            label: this.ports.intl.formatMessage(
              catWorkspaceContainerMessages.aiRecommendationLabel,
            ),
            status: "fail",
            message:
              error instanceof Error
                ? error.message
                : this.ports.intl.formatMessage(
                    catWorkspaceContainerMessages.aiRecommendationFailed,
                  ),
            category: "qa",
          };
        }
      }

      const [formatChecks, qaChecks] = await Promise.all([
        includeFormatChecks && validateFormat
          ? validateFormat(
              segmentForReview,
              segmentForReview.targetText,
              intelligence.glossaryTerms,
            )
          : Promise.resolve([]),
        includeFormatChecks && runQaChecks
          ? runQaChecks(segmentForReview, segmentForReview.targetText)
          : Promise.resolve([]),
      ]);
      if (this.disposed || !this.workspace.isReviewCurrent(sequence)) {
        return;
      }

      const withoutAiFailure = (checks: CatFormatCheck[]) =>
        checks.filter((check) => check.id !== `ai-recommendation-failed-${segmentId}`);
      const baseChecks = withoutAiFailure(
        recommendation?.formatChecks ?? [...formatChecks, ...qaChecks],
      );
      const checks = aiFailureCheck
        ? [aiFailureCheck, ...baseChecks.filter((check) => check.id !== aiFailureCheck.id)]
        : baseChecks;
      this.workspace.setFormatChecks(
        segmentId,
        checks,
        this.workspace.selectedSegmentId === segmentId,
      );
      if (recommendation) {
        this.workspace.mergeSegmentIntelligence(segmentId, {
          aiSuggestion: recommendation.aiSuggestion,
          aiReasoning: recommendation.aiReasoning,
        });
      }
    } finally {
      this.workspace.setReviewPhaseLoading(sequence, "ai", false);
      this.workspace.setReviewPhaseLoading(sequence, "formatChecks", false);
    }
  }

  async approve(segmentId: string, targetText: string) {
    this.workspace.isApproving = true;
    try {
      const nextStatus =
        (await this.ports.review?.onApprove?.(segmentId, targetText)) ?? "reviewed";
      this.workspace.markSegmentSaved(segmentId, targetText, nextStatus as CatSegmentStatus);
      const visibleSegments = this.workspace.getFilteredQueueSegments(
        this.ports.queueFilter,
        this.ports.usesServerQueueFilter,
      );
      const currentIndex = visibleSegments.findIndex((segment) => segment.id === segmentId);
      this.workspace.setSelectedSegmentId(
        visibleSegments[currentIndex + 1]?.id ?? this.workspace.selectedSegmentId,
      );
    } catch (error) {
      this.workspace.addSaveFailureCheck(
        segmentId,
        error instanceof Error
          ? error.message
          : this.ports.intl.formatMessage(catWorkspaceContainerMessages.saveTranslationFailed),
        this.ports.intl.formatMessage(catWorkspaceContainerMessages.saveFailedLabel),
      );
    } finally {
      this.workspace.isApproving = false;
    }
  }

  async saveDraft(segmentId: string, targetText: string) {
    const saveDraft = this.ports.review?.onSaveDraft;
    if (!saveDraft) {
      return;
    }
    this.workspace.isSavingDraft = true;
    try {
      const nextStatus = (await saveDraft(segmentId, targetText)) ?? "needs_review";
      this.workspace.markSegmentSaved(segmentId, targetText, nextStatus as CatSegmentStatus);
    } catch (error) {
      this.workspace.addSaveFailureCheck(
        segmentId,
        error instanceof Error
          ? error.message
          : this.ports.intl.formatMessage(catWorkspaceContainerMessages.saveTranslationFailed),
        this.ports.intl.formatMessage(catWorkspaceContainerMessages.saveFailedLabel),
      );
    } finally {
      this.workspace.isSavingDraft = false;
    }
  }

  async addComment(segmentId: string, input: CatSegmentCommentInput) {
    const addComment = this.ports.review?.onAddComment;
    if (!addComment) {
      return;
    }
    this.workspace.commentPostError = undefined;
    this.workspace.isPostingComment = true;
    try {
      await addComment(segmentId, input);
    } catch (error) {
      this.workspace.commentPostError =
        error instanceof Error
          ? error.message
          : this.ports.intl.formatMessage(catEditorPanelMessages.commentPostFailed);
      throw error;
    } finally {
      this.workspace.isPostingComment = false;
    }
  }

  async resolveComment(segmentId: string, commentId: string) {
    const resolveComment = this.ports.review?.onResolveComment;
    if (!resolveComment) {
      return;
    }
    this.workspace.commentPostError = undefined;
    this.workspace.resolvingCommentId = commentId;
    this.workspace.isResolvingComment = true;
    try {
      await resolveComment(segmentId, commentId);
    } catch (error) {
      this.workspace.commentPostError =
        error instanceof Error
          ? error.message
          : this.ports.intl.formatMessage(catEditorPanelMessages.commentResolveFailed);
      throw error;
    } finally {
      this.workspace.isResolvingComment = false;
      this.workspace.resolvingCommentId = null;
    }
  }

  skip(segmentId: string) {
    this.workspace.setSegmentStatus(segmentId, "skipped");
    this.ports.review?.onSkip?.(segmentId);
  }

  async bulkApprove() {
    const segmentIds = [...this.workspace.checkedSegmentIds];
    if (segmentIds.length === 0) {
      return;
    }
    this.workspace.isBulkActionPending = true;
    try {
      if (this.ports.review?.onBulkApprove) {
        await this.ports.review.onBulkApprove(segmentIds);
      } else {
        for (const segmentId of segmentIds) {
          const segment = this.workspace.getSegmentView(segmentId);
          if (segment) {
            await this.approve(segmentId, segment.targetText);
          }
        }
      }
    } finally {
      this.workspace.isBulkActionPending = false;
      this.workspace.clearChecked();
    }
  }

  async bulkSkip() {
    const segmentIds = [...this.workspace.checkedSegmentIds];
    if (segmentIds.length === 0) {
      return;
    }
    this.workspace.isBulkActionPending = true;
    try {
      if (this.ports.review?.onBulkSkip) {
        await this.ports.review.onBulkSkip(segmentIds);
      } else {
        for (const segmentId of segmentIds) {
          this.skip(segmentId);
        }
      }
    } finally {
      this.workspace.isBulkActionPending = false;
      this.workspace.clearChecked();
    }
  }
}
