import { makeAutoObservable, reaction, runInAction, type IReactionDisposer } from "mobx";

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

import { CatIntelligenceStore } from "./store/cat-intelligence-store";
import { CatQueueStore } from "./store/cat-queue-store";
import { CatSegmentDraft } from "./store/cat-segment-draft";
import { CatSegmentStore } from "./store/cat-segment-store";
import { CatWorkspaceUiStore } from "./store/cat-workspace-ui-store";
import { composeSegmentView, toQueueSegment } from "./store/cat-segment-view";
import {
  collectSegmentsWithAgentContext,
  hasSaveFailureCheck,
  mergeSegmentIntelligenceOnHydrate,
} from "./store/cat-workspace-store-utils";

type UnsavedNavigationPrompt = {
  kind: "segment" | "page";
  proceed: () => void;
};

interface WorkspaceControllerLifecycle {
  start(): void;
  dispose(): void;
}

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

export class CatWorkspaceOrchestrator {
  readonly queue = new CatQueueStore();
  readonly segments = new CatSegmentStore();
  readonly intelligenceState = new CatIntelligenceStore();
  readonly ui = new CatWorkspaceUiStore();

  jobTitle?: string;
  breadcrumbs?: string[];
  primaryActionLabel?: string;

  fileContext: CatFileContext = defaultFileContext;

  isApproving = false;
  isSavingDraft = false;
  isBulkActionPending = false;

  unsavedNavigationPrompt: UnsavedNavigationPrompt | null = null;

  private lastHydratedSnapshot: CatWorkspaceState | null = null;
  private initialSegmentJumpApplied = false;
  autoFilledSegmentIds = new Set<string>();

  validationSequence = 0;
  reviewSequence = 0;
  private controllers: WorkspaceControllerLifecycle[] = [];
  private dirtyStateDisposer?: IReactionDisposer;
  private beforeUnloadHandler?: (event: BeforeUnloadEvent) => void;

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

  attachControllers(...controllers: WorkspaceControllerLifecycle[]) {
    this.controllers = controllers;
  }

  start() {
    for (const controller of this.controllers) {
      controller.start();
    }
    this.dirtyStateDisposer?.();
    if (typeof window !== "undefined") {
      if (this.beforeUnloadHandler) {
        window.removeEventListener("beforeunload", this.beforeUnloadHandler);
      }
      const handleBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
      this.beforeUnloadHandler = handleBeforeUnload;
      this.dirtyStateDisposer = reaction(
        () => this.segments.hasDirtySegments,
        (hasDirtySegments, previousHasDirtySegments) => {
          if (previousHasDirtySegments) {
            window.removeEventListener("beforeunload", handleBeforeUnload);
          }
          if (hasDirtySegments) {
            window.addEventListener("beforeunload", handleBeforeUnload);
          }
        },
        { fireImmediately: true },
      );
    }
  }

  dispose() {
    this.dirtyStateDisposer?.();
    this.dirtyStateDisposer = undefined;
    if (this.beforeUnloadHandler && typeof window !== "undefined") {
      window.removeEventListener("beforeunload", this.beforeUnloadHandler);
      this.beforeUnloadHandler = undefined;
    }
    for (const controller of this.controllers) {
      controller.dispose();
    }
  }

  get selectedSegmentId() {
    return this.queue.selectedSegmentId;
  }

  set selectedSegmentId(value: string) {
    this.queue.selectedSegmentId = value;
  }

  get queueFilter() {
    return this.queue.filter;
  }

  set queueFilter(value: CatQueueFilter) {
    this.queue.filter = value;
  }

  get checkedSegmentIds() {
    return this.queue.checkedSegmentIds;
  }

  set checkedSegmentIds(value: Set<string>) {
    this.queue.checkedSegmentIds = value;
  }

  get segmentMeta() {
    return this.queue.segmentMeta;
  }

  get segmentComments() {
    return this.segments.comments;
  }

  set segmentComments(value: Map<string, CatSegmentComment[]>) {
    this.segments.comments = value;
  }

  get drafts() {
    return this.segments.drafts;
  }

  get formatChecks() {
    return this.intelligenceState.formatChecks;
  }

  set formatChecks(value: CatFormatCheck[]) {
    this.intelligenceState.formatChecks = value;
  }

  get segmentFormatChecks() {
    return this.intelligenceState.segmentFormatChecks;
  }

  set segmentFormatChecks(value: Record<string, CatFormatCheck[]>) {
    this.intelligenceState.segmentFormatChecks = value;
  }

  get intelligence() {
    return this.intelligenceState.fileIntelligence;
  }

  set intelligence(value: CatSegmentIntelligence) {
    this.intelligenceState.fileIntelligence = value;
  }

  get segmentIntelligence() {
    return this.intelligenceState.bySegment;
  }

  set segmentIntelligence(value: Record<string, CatSegmentIntelligence>) {
    this.intelligenceState.bySegment = value;
  }

  get revealedAgentContextSegmentIds() {
    return this.intelligenceState.revealedAgentContextSegmentIds;
  }

  set revealedAgentContextSegmentIds(value: Set<string>) {
    this.intelligenceState.revealedAgentContextSegmentIds = value;
  }

  get isValidating() {
    return this.intelligenceState.isValidating;
  }

  set isValidating(value: boolean) {
    this.intelligenceState.isValidating = value;
  }

  get isPostingComment() {
    return this.segments.isPostingComment;
  }

  set isPostingComment(value: boolean) {
    this.segments.isPostingComment = value;
  }

  get isResolvingComment() {
    return this.segments.isResolvingComment;
  }

  set isResolvingComment(value: boolean) {
    this.segments.isResolvingComment = value;
  }

  get resolvingCommentId() {
    return this.segments.resolvingCommentId;
  }

  set resolvingCommentId(value: string | null) {
    this.segments.resolvingCommentId = value;
  }

  get commentPostError() {
    return this.segments.commentPostError;
  }

  set commentPostError(value: string | undefined) {
    this.segments.commentPostError = value;
  }

  get isLookingUpContext() {
    const selectedSegmentId =
      this.findSegmentIdByKeyOrId(this.selectedSegmentId) ?? this.selectedSegmentId;
    return this.intelligenceState.contextLoadingSegmentIds.has(selectedSegmentId);
  }

  get concordanceLoadingSegmentId() {
    return this.intelligenceState.concordanceLoadingSegmentId;
  }

  set concordanceLoadingSegmentId(value: string | null) {
    this.intelligenceState.concordanceLoadingSegmentId = value;
  }

  get isLoadingVisualContext() {
    return this.intelligenceState.isLoadingVisualContext;
  }

  set isLoadingVisualContext(value: boolean) {
    this.intelligenceState.isLoadingVisualContext = value;
  }

  get isGeneratingAiRecommendation() {
    return this.intelligenceState.isGeneratingAiRecommendation;
  }

  set isGeneratingAiRecommendation(value: boolean) {
    this.intelligenceState.isGeneratingAiRecommendation = value;
  }

  get isRunningFormatChecks() {
    return this.intelligenceState.isRunningFormatChecks;
  }

  set isRunningFormatChecks(value: boolean) {
    this.intelligenceState.isRunningFormatChecks = value;
  }

  get isSegmentTargetLoading() {
    return this.segments.isTargetLoading;
  }

  set isSegmentTargetLoading(value: boolean) {
    this.segments.isTargetLoading = value;
  }

  get isCommentsLoading() {
    return this.segments.isCommentsLoading;
  }

  set isCommentsLoading(value: boolean) {
    this.segments.isCommentsLoading = value;
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
    return this.segments.dirtySegmentIds;
  }

  get queueSegments(): CatQueueSegment[] {
    return this.queue.segments;
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

  get intelligenceSegmentId() {
    return this.ui.hoveredSegmentId ?? this.selectedSegmentId;
  }

  get intelligenceSegmentView(): CatSegment | undefined {
    const segmentId =
      this.findSegmentIdByKeyOrId(this.intelligenceSegmentId) ?? this.intelligenceSegmentId;
    if (!segmentId) {
      return undefined;
    }

    return this.getSegmentView(segmentId);
  }

  get loadingSegmentIds(): ReadonlySet<string> {
    const ids = new Set<string>();
    if (this.isSegmentTargetLoading && this.selectedSegmentId) {
      ids.add(this.selectedSegmentId);
    }
    if (this.ui.previewTargetLoading && this.ui.previewLoadingSegmentId) {
      ids.add(this.ui.previewLoadingSegmentId);
    }
    return ids;
  }

  get isIntelligenceCommentsLoading() {
    const segmentId = this.intelligenceSegmentId;
    if (!segmentId) {
      return false;
    }

    if (segmentId === this.selectedSegmentId) {
      return this.isCommentsLoading;
    }

    return this.ui.previewCommentsLoading;
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
      const selectedDraftIsDirty = Boolean(this.drafts.get(this.selectedSegmentId)?.isDirty);
      const retainedSelectedSegmentId =
        selectedDraftIsDirty && this.segmentMeta.has(this.selectedSegmentId)
          ? this.selectedSegmentId
          : null;
      const selectedSegmentId = nextSegmentIds.has(this.selectedSegmentId)
        ? this.selectedSegmentId
        : (retainedSelectedSegmentId ??
          normalizedNext.selectedSegmentId ??
          normalizedNext.queueSegments[0]?.id ??
          normalizedNext.segments?.[0]?.id ??
          "");

      this.selectedSegmentId = selectedSegmentId;
      const visibleSegmentIds = new Set(nextSegmentIds);
      if (retainedSelectedSegmentId) {
        visibleSegmentIds.add(retainedSelectedSegmentId);
      }
      this.queue.reconcileVisibleIds(visibleSegmentIds);

      const matchedSegmentId = initialSegmentKeyOrId
        ? this.findSegmentIdByKeyOrId(initialSegmentKeyOrId)
        : null;
      if (matchedSegmentId && !this.initialSegmentJumpApplied && !selectedDraftIsDirty) {
        this.initialSegmentJumpApplied = true;
        this.selectedSegmentId = matchedSegmentId;
      }

      if (currentShell.selectedSegmentId !== this.selectedSegmentId) {
        this.formatChecks =
          this.segmentFormatChecks[this.selectedSegmentId] ?? normalizedNext.formatChecks;
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
    for (const segmentId of this.segmentMeta.keys()) {
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
    this.queue.select(segmentId);
    this.segments.clearCommentError();
    this.ui.clearHoveredSegment();
  }

  setTargetText(segmentId: string, value: string) {
    this.segments.setTargetText(segmentId, value, this.segmentMeta.has(segmentId));
  }

  setSegmentStatus(segmentId: string, status: CatSegmentStatus) {
    this.segments.setStatus(segmentId, status, this.segmentMeta.has(segmentId));
  }

  markSegmentSaved(segmentId: string, targetText: string, status?: CatSegmentStatus) {
    this.segments.markSaved(segmentId, targetText, status, this.segmentMeta.has(segmentId));
  }

  setFormatChecks(segmentId: string, checks: CatFormatCheck[], isSelected: boolean) {
    this.intelligenceState.setChecks(segmentId, checks, isSelected);
  }

  setSegmentIntelligence(segmentId: string, intelligence: CatSegmentIntelligence) {
    this.intelligenceState.setSegment(segmentId, intelligence);
  }

  mergeSegmentIntelligence(segmentId: string, patch: Partial<CatSegmentIntelligence>) {
    this.intelligenceState.mergeSegment(segmentId, patch);
  }

  clearAgentContexts() {
    this.intelligenceState.clearAgentContexts();
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
    this.intelligenceState.revealAgentContext(segmentId);
  }

  setCheckedSegmentIds(next: ReadonlySet<string>) {
    this.checkedSegmentIds = new Set(next);
  }

  toggleSegmentChecked(segmentId: string, checked: boolean) {
    this.queue.toggleChecked(segmentId, checked);
  }

  selectAllVisible(segmentIds: string[]) {
    this.queue.selectAll(segmentIds);
  }

  clearChecked() {
    this.queue.clearChecked();
  }

  pruneCheckedToVisible(visibleIds: ReadonlySet<string>) {
    const next = new Set([...this.checkedSegmentIds].filter((id) => visibleIds.has(id)));
    if (next.size !== this.checkedSegmentIds.size) {
      this.checkedSegmentIds = next;
    }
  }

  setQueueFilter(filter: CatQueueFilter) {
    const filtered = this.getFilteredQueueSegments(filter, false);
    const selectionWillChange = !filtered.some(
      (segment) => segment.id === this.selectedSegmentId || segment.key === this.selectedSegmentId,
    );
    const applyFilter = () => {
      this.queue.setFilter(filter);
      if (selectionWillChange) {
        this.setSelectedSegmentId(filtered[0]?.id ?? "");
      }
    };

    if (selectionWillChange) {
      this.attemptSegmentNavigation(applyFilter);
      return;
    }

    applyFilter();
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
    this.segments.clearCommentError();
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

  beginContextLookup(segmentId: string) {
    this.intelligenceState.beginContextLookup(segmentId);
  }

  endContextLookup(segmentId: string) {
    this.intelligenceState.endContextLookup(segmentId);
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

export function createCatWorkspace(
  initialState: CatWorkspaceState,
  initialSegmentKeyOrId?: string | null,
) {
  const workspace = new CatWorkspaceOrchestrator();
  workspace.reset(initialState, initialSegmentKeyOrId);
  return workspace;
}
