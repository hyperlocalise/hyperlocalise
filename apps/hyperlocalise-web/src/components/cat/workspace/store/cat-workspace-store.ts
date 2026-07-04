import { makeAutoObservable, runInAction } from "mobx";

import {
  findSegmentIdByKeyOrId,
  type CatQueueFilter,
} from "@/components/cat/queue/cat-queue-filter";
import type {
  CatFormatCheck,
  CatSegment,
  CatSegmentIntelligence,
  CatSegmentStatus,
  CatWorkspaceState,
} from "@/components/cat/shared/types";

import { CatSegmentDraft } from "./cat-segment-draft";
import {
  collectSegmentsWithAgentContext,
  hasSaveFailureCheck,
  mergeSegmentIntelligenceOnHydrate,
} from "./cat-workspace-store-utils";

type UnsavedNavigationPrompt = {
  kind: "segment" | "page";
  proceed: () => void;
};

function getSegmentsById(state: CatWorkspaceState) {
  return new Map(state.segments.map((segment) => [segment.id, segment]));
}

export class CatWorkspaceStore {
  jobTitle?: string;
  breadcrumbs?: string[];
  primaryActionLabel?: string;
  canEditTranslations = true;
  canAddComments = false;
  providerKind: string | null = null;

  selectedSegmentId = "";
  queueFilter: CatQueueFilter = "all";
  checkedSegmentIds = new Set<string>();

  /** Server-owned segment fields excluding draft target/status */
  segmentMeta = new Map<string, Omit<CatSegment, "targetText" | "status">>();
  drafts = new Map<string, CatSegmentDraft>();

  formatChecks: CatFormatCheck[] = [];
  segmentFormatChecks: Record<string, CatFormatCheck[]> = {};
  intelligence: CatSegmentIntelligence = { glossaryTerms: [] };
  segmentIntelligence: Record<string, CatSegmentIntelligence> = {};
  revealedAgentContextSegmentIds = new Set<string>();

  isValidating = false;
  isApproving = false;
  isSavingDraft = false;
  isPostingComment = false;
  isResolvingComment = false;
  resolvingCommentId: string | null = null;
  commentPostError: string | undefined;
  isLookingUpContext = false;
  isLoadingConcordance = false;
  isLoadingVisualContext = false;
  isGeneratingAiRecommendation = false;
  isRunningFormatChecks = false;
  isBulkActionPending = false;

  unsavedNavigationPrompt: UnsavedNavigationPrompt | null = null;

  private lastHydratedSnapshot: CatWorkspaceState | null = null;
  private initialSegmentJumpApplied = false;
  autoFilledSegmentIds = new Set<string>();

  validationSequence = 0;
  reviewSequence = 0;

  constructor() {
    makeAutoObservable(
      this,
      {
        validationSequence: false,
        reviewSequence: false,
      },
      { autoBind: true },
    );
  }

  get dirtySegmentIds(): ReadonlySet<string> {
    return new Set(
      [...this.drafts.values()].filter((draft) => draft.isDirty).map((draft) => draft.segmentId),
    );
  }

  get segments(): CatSegment[] {
    return [...this.segmentMeta.values()]
      .map((meta) => {
        const draft = this.drafts.get(meta.id);
        return {
          ...meta,
          targetText: draft?.targetText ?? "",
          status: draft?.status ?? "pending",
        };
      })
      .sort((left, right) => left.index - right.index);
  }

  get workspaceState(): CatWorkspaceState {
    return {
      segments: this.segments,
      selectedSegmentId: this.selectedSegmentId,
      formatChecks: this.formatChecks,
      segmentFormatChecks: this.segmentFormatChecks,
      intelligence: this.intelligence,
      segmentIntelligence: this.segmentIntelligence,
      jobTitle: this.jobTitle,
      breadcrumbs: this.breadcrumbs,
      primaryActionLabel: this.primaryActionLabel,
      canEditTranslations: this.canEditTranslations,
      canAddComments: this.canAddComments,
      providerKind: this.providerKind,
    };
  }

  get selectedSegment(): CatSegment | undefined {
    return this.segments.find(
      (segment) => segment.id === this.selectedSegmentId || segment.key === this.selectedSegmentId,
    );
  }

  get selectedDraft(): CatSegmentDraft | undefined {
    return this.drafts.get(this.selectedSegmentId);
  }

  reset(initialState: CatWorkspaceState, initialSegmentKeyOrId?: string | null) {
    this.lastHydratedSnapshot = null;
    this.initialSegmentJumpApplied = false;
    this.autoFilledSegmentIds = new Set();
    this.hydrateFromServerSnapshot(initialState, initialSegmentKeyOrId);
  }

  hydrateFromServerSnapshot(
    nextInitialState: CatWorkspaceState,
    initialSegmentKeyOrId?: string | null,
  ) {
    const previousInitialState = this.lastHydratedSnapshot;
    const currentState = this.workspaceState;

    runInAction(() => {
      this.jobTitle = nextInitialState.jobTitle;
      this.breadcrumbs = nextInitialState.breadcrumbs;
      this.primaryActionLabel = nextInitialState.primaryActionLabel;
      this.canEditTranslations = nextInitialState.canEditTranslations !== false;
      this.canAddComments = nextInitialState.canAddComments === true;
      this.providerKind = nextInitialState.providerKind ?? null;
      this.intelligence = nextInitialState.intelligence;

      if (!previousInitialState) {
        this.applySnapshotSegments(nextInitialState.segments);
        this.segmentFormatChecks = { ...nextInitialState.segmentFormatChecks };
        this.formatChecks = nextInitialState.formatChecks;
        this.segmentIntelligence = { ...nextInitialState.segmentIntelligence };
      } else {
        this.mergeSegmentsFromHydration(previousInitialState, currentState, nextInitialState);
        this.mergeFormatChecksFromHydration(previousInitialState, currentState, nextInitialState);
        this.mergeIntelligenceFromHydration(currentState, nextInitialState);
      }

      const nextSegmentIds = new Set(nextInitialState.segments.map((segment) => segment.id));
      const selectedSegmentId = nextSegmentIds.has(currentState.selectedSegmentId)
        ? currentState.selectedSegmentId
        : (nextInitialState.selectedSegmentId ?? nextInitialState.segments[0]?.id ?? "");

      this.selectedSegmentId = selectedSegmentId;

      const matchedSegmentId = initialSegmentKeyOrId
        ? findSegmentIdByKeyOrId(this.segments, initialSegmentKeyOrId)
        : null;
      if (matchedSegmentId && !this.initialSegmentJumpApplied) {
        this.initialSegmentJumpApplied = true;
        this.selectedSegmentId = matchedSegmentId;
      }

      this.revealedAgentContextSegmentIds = new Set([
        ...this.revealedAgentContextSegmentIds,
        ...collectSegmentsWithAgentContext(nextInitialState),
      ]);

      this.lastHydratedSnapshot = nextInitialState;
    });
  }

  private applySnapshotSegments(segments: CatSegment[]) {
    this.segmentMeta.clear();
    this.drafts.clear();

    for (const segment of segments) {
      const { targetText, status, ...meta } = segment;
      this.segmentMeta.set(segment.id, meta);
      this.drafts.set(segment.id, new CatSegmentDraft(segment.id, targetText, status));
    }
  }

  private mergeSegmentsFromHydration(
    previousInitialState: CatWorkspaceState,
    currentState: CatWorkspaceState,
    nextInitialState: CatWorkspaceState,
  ) {
    const previousSegments = getSegmentsById(previousInitialState);
    const currentSegments = getSegmentsById(currentState);

    for (const nextSegment of nextInitialState.segments) {
      const { targetText, status, ...meta } = nextSegment;
      const previousSegment = previousSegments.get(nextSegment.id);
      const currentSegment = currentSegments.get(nextSegment.id);
      const existingDraft = this.drafts.get(nextSegment.id);

      this.segmentMeta.set(nextSegment.id, meta);

      if (!previousSegment || !currentSegment || !existingDraft) {
        this.drafts.set(nextSegment.id, new CatSegmentDraft(nextSegment.id, targetText, status));
        continue;
      }

      if (currentSegment.targetText === previousSegment.targetText) {
        existingDraft.applyServerTarget(targetText, status);
      } else {
        existingDraft.applyServerStatus(status);
      }
    }

    for (const segmentId of this.drafts.keys()) {
      if (!nextInitialState.segments.some((segment) => segment.id === segmentId)) {
        const draft = this.drafts.get(segmentId);
        if (!draft?.isDirty) {
          this.drafts.delete(segmentId);
          this.segmentMeta.delete(segmentId);
        }
      }
    }
  }

  private mergeFormatChecksFromHydration(
    previousInitialState: CatWorkspaceState,
    currentState: CatWorkspaceState,
    nextInitialState: CatWorkspaceState,
  ) {
    const previousSegments = getSegmentsById(previousInitialState);
    const currentSegments = getSegmentsById(currentState);
    const segmentFormatChecks: Record<string, CatFormatCheck[]> = {
      ...nextInitialState.segmentFormatChecks,
    };

    for (const segment of this.segments) {
      const previousSegment = previousSegments.get(segment.id);
      const currentSegment = currentSegments.get(segment.id);
      const currentChecks = currentState.segmentFormatChecks?.[segment.id];

      if (
        previousSegment &&
        currentSegment &&
        currentChecks &&
        (currentSegment.targetText !== previousSegment.targetText ||
          hasSaveFailureCheck(currentChecks))
      ) {
        segmentFormatChecks[segment.id] = currentChecks;
      }
    }

    this.segmentFormatChecks = segmentFormatChecks;
    this.formatChecks =
      currentState.selectedSegmentId === this.selectedSegmentId
        ? currentState.formatChecks
        : nextInitialState.formatChecks;
  }

  private mergeIntelligenceFromHydration(
    currentState: CatWorkspaceState,
    nextInitialState: CatWorkspaceState,
  ) {
    const segmentIntelligence: Record<string, CatSegmentIntelligence> = {
      ...nextInitialState.segmentIntelligence,
    };

    for (const segment of this.segments) {
      const merged = mergeSegmentIntelligenceOnHydrate({
        nextInitialState,
        currentState,
        segmentId: segment.id,
        existing: segmentIntelligence[segment.id],
      });
      if (merged) {
        segmentIntelligence[segment.id] = merged;
      }
    }

    this.segmentIntelligence = segmentIntelligence;
  }

  setSelectedSegmentId(segmentId: string) {
    this.selectedSegmentId = segmentId;
  }

  setTargetText(segmentId: string, value: string) {
    const draft = this.drafts.get(segmentId);
    if (draft) {
      draft.setTargetText(value);
      return;
    }

    const meta = this.segmentMeta.get(segmentId);
    if (meta) {
      this.drafts.set(segmentId, new CatSegmentDraft(segmentId, value, "pending"));
    }
  }

  setSegmentStatus(segmentId: string, status: CatSegmentStatus) {
    this.drafts.get(segmentId)?.setStatus(status);
  }

  markSegmentSaved(segmentId: string, targetText: string, status?: CatSegmentStatus) {
    this.drafts.get(segmentId)?.markSaved(targetText, status);
  }

  setFormatChecks(segmentId: string, checks: CatFormatCheck[], isSelected: boolean) {
    this.segmentFormatChecks = {
      ...this.segmentFormatChecks,
      [segmentId]: checks,
    };
    if (isSelected) {
      this.formatChecks = checks;
    }
  }

  setSegmentIntelligence(segmentId: string, intelligence: CatSegmentIntelligence) {
    this.segmentIntelligence = {
      ...this.segmentIntelligence,
      [segmentId]: intelligence,
    };
  }

  mergeSegmentIntelligence(segmentId: string, patch: Partial<CatSegmentIntelligence>) {
    const current = this.segmentIntelligence[segmentId] ?? this.intelligence;
    this.setSegmentIntelligence(segmentId, { ...current, ...patch });
  }

  addSaveFailureCheck(segmentId: string, message: string, label: string) {
    const saveFailureCheck: CatFormatCheck = {
      id: `save-failed-${segmentId}`,
      label,
      status: "fail",
      message,
      category: "qa",
    };
    const segmentChecks = this.segmentFormatChecks[segmentId] ?? this.formatChecks;
    const nextSegmentChecks = [
      saveFailureCheck,
      ...segmentChecks.filter((check) => !check.id.startsWith("save-failed-")),
    ];

    this.segmentFormatChecks = {
      ...this.segmentFormatChecks,
      [segmentId]: nextSegmentChecks,
    };
    if (this.selectedSegmentId === segmentId) {
      this.formatChecks = nextSegmentChecks;
    }
  }

  removeFormatCheck(segmentId: string, checkId: string) {
    const currentChecks = this.segmentFormatChecks[segmentId] ?? this.formatChecks;
    const nextChecks = currentChecks.filter((check) => check.id !== checkId);
    this.setFormatChecks(segmentId, nextChecks, this.selectedSegmentId === segmentId);
  }

  upsertFormatCheck(segmentId: string, check: CatFormatCheck) {
    const currentChecks = this.segmentFormatChecks[segmentId] ?? this.formatChecks;
    const nextChecks = [check, ...currentChecks.filter((item) => item.id !== check.id)];
    this.setFormatChecks(segmentId, nextChecks, this.selectedSegmentId === segmentId);
  }

  revealAgentContext(segmentId: string) {
    this.revealedAgentContextSegmentIds = new Set(this.revealedAgentContextSegmentIds).add(
      segmentId,
    );
  }

  setCheckedSegmentIds(next: ReadonlySet<string>) {
    this.checkedSegmentIds = new Set(next);
  }

  toggleSegmentChecked(segmentId: string, checked: boolean) {
    const next = new Set(this.checkedSegmentIds);
    if (checked) {
      next.add(segmentId);
    } else {
      next.delete(segmentId);
    }
    this.checkedSegmentIds = next;
  }

  selectAllVisible(segmentIds: string[]) {
    this.checkedSegmentIds = new Set(segmentIds);
  }

  clearChecked() {
    this.checkedSegmentIds = new Set();
  }

  pruneCheckedToVisible(visibleIds: ReadonlySet<string>) {
    const next = new Set([...this.checkedSegmentIds].filter((id) => visibleIds.has(id)));
    if (next.size !== this.checkedSegmentIds.size) {
      this.checkedSegmentIds = next;
    }
  }

  setQueueFilter(filter: CatQueueFilter) {
    this.queueFilter = filter;
    this.clearChecked();
  }

  attemptSegmentNavigation(proceed: () => void) {
    if (this.selectedDraft?.isDirty) {
      this.unsavedNavigationPrompt = { kind: "segment", proceed };
      return;
    }

    proceed();
  }

  attemptPageNavigation(proceed: () => void) {
    if (this.dirtySegmentIds.size > 0) {
      this.unsavedNavigationPrompt = { kind: "page", proceed };
      return;
    }

    proceed();
  }

  dismissUnsavedNavigationPrompt() {
    this.unsavedNavigationPrompt = null;
  }

  confirmUnsavedNavigation() {
    const proceed = this.unsavedNavigationPrompt?.proceed;
    this.unsavedNavigationPrompt = null;
    proceed?.();
  }

  clearCommentPostError() {
    this.commentPostError = undefined;
  }

  beginValidation(): number {
    this.validationSequence += 1;
    this.isValidating = true;
    return this.validationSequence;
  }

  isValidationCurrent(sequence: number): boolean {
    return this.validationSequence === sequence;
  }

  completeValidation(sequence: number): void {
    if (this.isValidationCurrent(sequence)) {
      this.isValidating = false;
    }
  }

  beginReview(options?: { includeAi?: boolean; showFormatChecksLoading?: boolean }): number {
    this.reviewSequence += 1;
    if (options?.includeAi) {
      this.isGeneratingAiRecommendation = true;
    }
    if (options?.showFormatChecksLoading) {
      this.isRunningFormatChecks = true;
    }
    return this.reviewSequence;
  }

  isReviewCurrent(sequence: number): boolean {
    return this.reviewSequence === sequence;
  }

  setReviewPhaseLoading(
    sequence: number,
    phase: "concordance" | "ai" | "formatChecks",
    loading: boolean,
  ): void {
    if (!this.isReviewCurrent(sequence)) {
      return;
    }

    switch (phase) {
      case "concordance":
        this.isLoadingConcordance = loading;
        break;
      case "ai":
        this.isGeneratingAiRecommendation = loading;
        break;
      case "formatChecks":
        this.isRunningFormatChecks = loading;
        break;
    }
  }
}

export function createCatWorkspaceStore(
  initialState: CatWorkspaceState,
  initialSegmentKeyOrId?: string | null,
) {
  const store = new CatWorkspaceStore();
  store.reset(initialState, initialSegmentKeyOrId);
  return store;
}
