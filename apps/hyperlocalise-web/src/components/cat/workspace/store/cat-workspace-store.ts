import { makeAutoObservable, runInAction } from "mobx";

import type {
  ProjectFileCatComment,
  ProjectFileCatTranslation,
} from "@/api/routes/project/project.schema";
import {
  findSegmentIdByKeyOrIdInQueue,
  isOpenIssueStatus,
  isServerQueueFilter,
  segmentMatchesQueueFilterFromInput,
  type CatQueueFilter,
} from "@/components/cat/queue/cat-queue-filter";
import type {
  CatFileContext,
  CatFormatCheck,
  CatQueueSegment,
  CatSegment,
  CatSegmentComment,
  CatSegmentIntelligence,
  CatSegmentStatus,
  CatWorkspaceShell,
  CatWorkspaceState,
} from "@/components/cat/shared/types";

import {
  segmentStatusFromTarget,
  mapSegmentComments,
} from "@/components/cat/project-file/project-file-cat-mapper";

import { CatSegmentDraft } from "./cat-segment-draft";
import { composeSegmentView, toQueueSegment } from "./cat-segment-view";
import {
  collectSegmentsWithAgentContext,
  hasSaveFailureCheck,
  mergeSegmentIntelligenceOnHydrate,
} from "./cat-workspace-store-utils";

type UnsavedNavigationPrompt = {
  kind: "segment" | "page";
  proceed: () => void;
};

const defaultFileContext: CatFileContext = {
  sourcePath: "",
  filename: "",
  sourceLocale: "en",
  targetLocale: "en",
  providerKind: null,
  canEditTranslations: true,
  canAddComments: false,
};

function normalizeSnapshot(state: CatWorkspaceState): CatWorkspaceState {
  const fileContext = resolveFileContext(state);
  const queueSegments =
    state.queueSegments.length > 0
      ? state.queueSegments
      : (state.segments ?? []).map(toQueueSegment);

  return {
    ...state,
    fileContext,
    queueSegments,
  };
}

export function resolveFileContext(state: CatWorkspaceState): CatFileContext {
  if (state.fileContext) {
    return state.fileContext;
  }

  const firstSegment =
    state.segments?.[0] ??
    (state.queueSegments?.[0]
      ? {
          sourceLocale: defaultFileContext.sourceLocale,
          targetLocale: defaultFileContext.targetLocale,
        }
      : undefined);

  return {
    sourcePath: state.intelligence.filePath ?? "",
    filename: state.breadcrumbs?.[1] ?? "",
    sourceLocale: firstSegment?.sourceLocale ?? defaultFileContext.sourceLocale,
    targetLocale: firstSegment?.targetLocale ?? defaultFileContext.targetLocale,
    providerKind: state.providerKind ?? null,
    canEditTranslations: state.canEditTranslations !== false,
    canAddComments: state.canAddComments === true,
    truncated: Boolean(state.intelligence.constraints),
  };
}

function intelligenceFromHydratedSegment(
  segment: CatSegment,
  existing: CatSegmentIntelligence | undefined,
): CatSegmentIntelligence | undefined {
  const segmentType = segment.tags?.find(
    (tag) => !tag.includes("comment") && !tag.includes("issue"),
  );
  const patch: Partial<CatSegmentIntelligence> = {};

  if (segment.contextLabel?.trim()) {
    patch.productMeaning = segment.contextLabel.trim();
  }

  if (segmentType) {
    patch.segmentType = segmentType;
  }

  if (segment.maxLength != null && segment.maxLength > 0) {
    patch.maxLength = segment.maxLength;
  }

  if (Object.keys(patch).length === 0) {
    return existing;
  }

  return {
    glossaryTerms: [],
    ...existing,
    ...patch,
  };
}

export class CatWorkspaceStore {
  jobTitle?: string;
  breadcrumbs?: string[];
  primaryActionLabel?: string;

  fileContext: CatFileContext = defaultFileContext;

  selectedSegmentId = "";
  queueFilter: CatQueueFilter = "all";
  checkedSegmentIds = new Set<string>();

  segmentMeta = new Map<string, CatQueueSegment>();
  segmentComments = new Map<string, CatSegmentComment[]>();
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
  concordanceLoadingSegmentId: string | null = null;
  isLoadingVisualContext = false;
  isGeneratingAiRecommendation = false;
  isRunningFormatChecks = false;
  isBulkActionPending = false;

  isSegmentTargetLoading = false;
  isCommentsLoading = false;

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

  get canEditTranslations() {
    return this.fileContext.canEditTranslations;
  }

  get canAddComments() {
    return this.fileContext.canAddComments;
  }

  get providerKind() {
    return this.fileContext.providerKind;
  }

  get isLoadingConcordance() {
    const selectedSegmentId =
      this.findSegmentIdByKeyOrId(this.selectedSegmentId) ?? this.selectedSegmentId;
    return (
      this.concordanceLoadingSegmentId !== null &&
      this.concordanceLoadingSegmentId === selectedSegmentId
    );
  }

  get dirtySegmentIds(): ReadonlySet<string> {
    return new Set(
      [...this.drafts.values()].filter((draft) => draft.isDirty).map((draft) => draft.segmentId),
    );
  }

  get queueSegments(): CatQueueSegment[] {
    return [...this.segmentMeta.values()].sort((left, right) => left.index - right.index);
  }

  get shellState(): CatWorkspaceShell {
    return {
      fileContext: this.fileContext,
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

  getSegmentView(segmentId: string): CatSegment | undefined {
    const meta = this.segmentMeta.get(segmentId);
    if (!meta) {
      return undefined;
    }

    return composeSegmentView({
      fileContext: this.fileContext,
      meta,
      draft: this.drafts.get(segmentId),
      comments: this.segmentComments.get(segmentId),
      intelligence: this.segmentIntelligence[segmentId],
    });
  }

  findSegmentIdByKeyOrId(segmentIdOrKey: string) {
    return findSegmentIdByKeyOrIdInQueue(this.queueSegments, segmentIdOrKey);
  }

  segmentHasOpenIssues(segmentId: string) {
    return (
      this.segmentComments
        .get(segmentId)
        ?.some((comment) => comment.type === "issue" && isOpenIssueStatus(comment.status)) ?? false
    );
  }

  matchesQueueFilter(segmentId: string, filter: CatQueueFilter) {
    const draft = this.drafts.get(segmentId);
    return segmentMatchesQueueFilterFromInput(
      {
        status: draft?.status ?? "pending",
        hasOpenIssues: this.segmentHasOpenIssues(segmentId),
      },
      filter,
    );
  }

  getFilteredQueueSegments(filter: CatQueueFilter, usesServerQueueFilter: boolean) {
    if (usesServerQueueFilter && isServerQueueFilter(filter)) {
      return this.queueSegments;
    }

    if (filter === "all") {
      return this.queueSegments;
    }

    return this.queueSegments.filter((meta) => this.matchesQueueFilter(meta.id, filter));
  }

  getQueuePanelSegments(filter: CatQueueFilter, usesServerQueueFilter: boolean): CatSegment[] {
    return this.getFilteredQueueSegments(filter, usesServerQueueFilter).map((meta) => ({
      ...meta,
      sourceLocale: this.fileContext.sourceLocale,
      targetLocale: this.fileContext.targetLocale,
      targetText: "",
      status: this.drafts.get(meta.id)?.status ?? "pending",
    }));
  }

  get selectedSegmentView(): CatSegment | undefined {
    const segmentId = this.findSegmentIdByKeyOrId(this.selectedSegmentId) ?? this.selectedSegmentId;
    return this.getSegmentView(segmentId);
  }

  get selectedDraft(): CatSegmentDraft | undefined {
    const segmentId = this.findSegmentIdByKeyOrId(this.selectedSegmentId) ?? this.selectedSegmentId;
    return this.drafts.get(segmentId);
  }

  reset(initialState: CatWorkspaceState, initialSegmentKeyOrId?: string | null) {
    this.lastHydratedSnapshot = null;
    this.initialSegmentJumpApplied = false;
    this.autoFilledSegmentIds = new Set();
    this.ingestQueue(initialState, initialSegmentKeyOrId);
  }

  ingestQueue(nextInitialState: CatWorkspaceState, initialSegmentKeyOrId?: string | null) {
    this.hydrateFromServerSnapshot(nextInitialState, initialSegmentKeyOrId);
  }

  hydrateFromServerSnapshot(
    nextInitialState: CatWorkspaceState,
    initialSegmentKeyOrId?: string | null,
  ) {
    const normalizedNext = normalizeSnapshot(nextInitialState);
    const previousInitialState = this.lastHydratedSnapshot;
    const currentShell = this.shellState;
    const nextFileContext = resolveFileContext(normalizedNext);

    runInAction(() => {
      this.fileContext = nextFileContext;
      this.jobTitle = normalizedNext.jobTitle;
      this.breadcrumbs = normalizedNext.breadcrumbs;
      this.primaryActionLabel = normalizedNext.primaryActionLabel;
      this.intelligence = normalizedNext.intelligence;

      if (!previousInitialState) {
        if (normalizedNext.segments?.length) {
          this.applySnapshotSegments(normalizedNext.segments, normalizedNext.segmentIntelligence);
        } else {
          this.applySnapshotQueueMeta(
            normalizedNext.queueSegments,
            normalizedNext.segmentIntelligence,
          );
        }
        this.segmentFormatChecks = { ...normalizedNext.segmentFormatChecks };
        this.formatChecks = normalizedNext.formatChecks;
        this.segmentIntelligence = {
          ...this.segmentIntelligence,
          ...normalizedNext.segmentIntelligence,
        };
      } else {
        this.mergeQueueMetaFromSnapshot(normalizedNext);
        this.mergeFormatChecksFromHydration(currentShell, normalizedNext);
        this.mergeIntelligenceFromHydration(currentShell, normalizedNext);
      }

      const nextSegmentIds = new Set(normalizedNext.queueSegments.map((segment) => segment.id));
      const selectedSegmentId = nextSegmentIds.has(this.selectedSegmentId)
        ? this.selectedSegmentId
        : (normalizedNext.selectedSegmentId ??
          normalizedNext.queueSegments[0]?.id ??
          normalizedNext.segments?.[0]?.id ??
          "");

      this.selectedSegmentId = selectedSegmentId;

      const matchedSegmentId = initialSegmentKeyOrId
        ? this.findSegmentIdByKeyOrId(initialSegmentKeyOrId)
        : null;
      if (matchedSegmentId && !this.initialSegmentJumpApplied) {
        this.initialSegmentJumpApplied = true;
        this.selectedSegmentId = matchedSegmentId;
      }

      this.revealedAgentContextSegmentIds = new Set([
        ...this.revealedAgentContextSegmentIds,
        ...collectSegmentsWithAgentContext(normalizedNext),
      ]);

      this.lastHydratedSnapshot = normalizedNext;
    });
  }

  applySegmentTarget(segmentId: string, target: ProjectFileCatTranslation | null) {
    if (!this.segmentMeta.has(segmentId)) {
      return;
    }

    const targetText = target?.text ?? "";
    const status = segmentStatusFromTarget(
      { hasOpenIssues: this.segmentHasOpenIssues(segmentId) },
      target,
    );
    const existingDraft = this.drafts.get(segmentId);

    if (existingDraft) {
      if (existingDraft.isDirty) {
        existingDraft.applyServerStatus(status);
        return;
      }

      existingDraft.applyServerTarget(targetText, status);
      return;
    }

    this.drafts.set(segmentId, new CatSegmentDraft(segmentId, targetText, status));
  }

  applySegmentComments(segmentId: string, comments: ProjectFileCatComment[]) {
    if (!this.segmentMeta.has(segmentId)) {
      return;
    }

    const mappedComments = mapSegmentComments(comments);
    this.segmentComments.set(segmentId, mappedComments);

    const hasOpenIssues = mappedComments.some(
      (comment) => comment.type === "issue" && isOpenIssueStatus(comment.status),
    );
    const draft = this.drafts.get(segmentId);
    if (draft && hasOpenIssues && draft.status !== "reviewed") {
      draft.applyServerStatus("needs_review");
    }
  }

  setSegmentTargetLoading(loading: boolean) {
    this.isSegmentTargetLoading = loading;
  }

  setCommentsLoading(loading: boolean) {
    this.isCommentsLoading = loading;
  }

  private applySnapshotQueueMeta(
    queueSegments: CatQueueSegment[],
    segmentIntelligence: CatWorkspaceState["segmentIntelligence"] = {},
  ) {
    this.segmentMeta.clear();
    this.segmentComments.clear();
    this.drafts.clear();
    this.segmentIntelligence = { ...segmentIntelligence };

    for (const meta of queueSegments) {
      this.segmentMeta.set(meta.id, meta);
    }
  }

  private applySnapshotSegments(
    segments: CatSegment[],
    segmentIntelligence: CatWorkspaceState["segmentIntelligence"],
  ) {
    this.segmentMeta.clear();
    this.segmentComments.clear();
    this.drafts.clear();
    this.segmentIntelligence = { ...segmentIntelligence };

    for (const segment of segments) {
      this.segmentMeta.set(segment.id, toQueueSegment(segment));
      if (segment.comments !== undefined) {
        this.segmentComments.set(segment.id, segment.comments);
      }
      if (segment.targetText.trim() || segment.status !== "pending") {
        this.drafts.set(
          segment.id,
          new CatSegmentDraft(segment.id, segment.targetText, segment.status),
        );
      }

      const mergedIntelligence = intelligenceFromHydratedSegment(
        segment,
        this.segmentIntelligence[segment.id],
      );
      if (mergedIntelligence) {
        this.segmentIntelligence[segment.id] = mergedIntelligence;
      }
    }
  }

  private mergeQueueMetaFromSnapshot(nextInitialState: CatWorkspaceState) {
    for (const meta of nextInitialState.queueSegments) {
      this.segmentMeta.set(meta.id, meta);
    }

    const nextSegmentIds = new Set(nextInitialState.queueSegments.map((meta) => meta.id));
    for (const segmentId of this.drafts.keys()) {
      if (!nextSegmentIds.has(segmentId)) {
        const draft = this.drafts.get(segmentId);
        if (!draft?.isDirty) {
          this.drafts.delete(segmentId);
          this.segmentMeta.delete(segmentId);
          this.segmentComments.delete(segmentId);
        }
      }
    }
  }

  private mergeFormatChecksFromHydration(
    currentShell: CatWorkspaceShell,
    nextInitialState: CatWorkspaceState,
  ) {
    const segmentFormatChecks: Record<string, CatFormatCheck[]> = {
      ...nextInitialState.segmentFormatChecks,
    };

    for (const segmentId of this.segmentMeta.keys()) {
      const currentDraft = this.drafts.get(segmentId);
      const currentChecks = currentShell.segmentFormatChecks?.[segmentId];

      if (currentChecks && (currentDraft?.isDirty || hasSaveFailureCheck(currentChecks))) {
        segmentFormatChecks[segmentId] = currentChecks;
      }
    }

    this.segmentFormatChecks = segmentFormatChecks;
    this.formatChecks =
      currentShell.selectedSegmentId === this.selectedSegmentId
        ? currentShell.formatChecks
        : nextInitialState.formatChecks;
  }

  private mergeIntelligenceFromHydration(
    currentShell: CatWorkspaceShell,
    nextInitialState: CatWorkspaceState,
  ) {
    const segmentIntelligence: Record<string, CatSegmentIntelligence> = {
      ...nextInitialState.segmentIntelligence,
    };

    for (const segmentId of this.segmentMeta.keys()) {
      const merged = mergeSegmentIntelligenceOnHydrate({
        nextInitialState,
        currentState: currentShell,
        segmentId,
        existing: segmentIntelligence[segmentId],
      });
      if (merged) {
        segmentIntelligence[segmentId] = merged;
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
      const nextDraft = new CatSegmentDraft(segmentId, "", "pending");
      nextDraft.setTargetText(value);
      this.drafts.set(segmentId, nextDraft);
    }
  }

  setSegmentStatus(segmentId: string, status: CatSegmentStatus) {
    const draft = this.drafts.get(segmentId);
    if (draft) {
      draft.setStatus(status);
      return;
    }

    const meta = this.segmentMeta.get(segmentId);
    if (meta) {
      this.drafts.set(segmentId, new CatSegmentDraft(segmentId, "", status));
    }
  }

  markSegmentSaved(segmentId: string, targetText: string, status?: CatSegmentStatus) {
    const draft = this.drafts.get(segmentId);
    if (draft) {
      draft.markSaved(targetText, status);
      return;
    }

    const meta = this.segmentMeta.get(segmentId);
    if (meta) {
      this.drafts.set(
        segmentId,
        new CatSegmentDraft(segmentId, targetText, status ?? "needs_review"),
      );
    }
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

  beginConcordanceLoad(segmentId: string) {
    this.concordanceLoadingSegmentId = segmentId;
  }

  endConcordanceLoad(segmentId: string) {
    if (this.concordanceLoadingSegmentId === segmentId) {
      this.concordanceLoadingSegmentId = null;
    }
  }

  setReviewPhaseLoading(sequence: number, phase: "ai" | "formatChecks", loading: boolean): void {
    if (!this.isReviewCurrent(sequence)) {
      return;
    }

    switch (phase) {
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
